import { Address, KeyHash } from "@evolution-sdk/evolution"

import { expectKeyHash } from "../../../packages/cardano/src/internal/addresses.js"
import { FlowController } from "./flow-controller.js"
import type { FlowReadiness } from "./flow-renderer.js"
import { postJson } from "./http.js"
import { inspectMultisigUnlock } from "./multisig-inspection.js"
import {
  eacMintReview,
  eacRetireReview,
  metadataReview,
  mintReview,
  multisigLockReview,
  multisigUnlockReview,
  paymentReview,
} from "./review-summary.js"
import type { WorkbenchLogger } from "./technical-log.js"
import { inputValue, type TxBuildResponse } from "./workbench-ui.js"
import { signWithWallet, type WalletSession } from "./wallet.js"

export type WorkbenchFlowDependencies = {
  wallet: () => WalletSession
  fundedReadiness: () => FlowReadiness
  eacRetirementReadiness: () => FlowReadiness
  multisigLockReadiness: () => FlowReadiness
  scriptSpendReadiness: () => FlowReadiness
  multisigSetupReady: () => boolean
  onChange: () => void
  log: WorkbenchLogger
}

export const createWorkbenchFlows = (dependencies: WorkbenchFlowDependencies) => {
  const sign = (unsigned: string) => signWithWallet(dependencies.wallet(), unsigned)
  const multisigPayload = () => ({
    userAddress: dependencies.wallet().address,
    secondSignerAddress: inputValue("#multisigSecondSigner"),
  })

  return {
    payment: new FlowController({
      id: "payment",
      title: "Pagamento simples",
      witnessIds: ["paymentWitness"],
      inputSelectors: ["#paymentRecipient", "#paymentLovelace"],
      build: () => buildTx("/api/workshop/01-payment", {
        userAddress: dependencies.wallet().address,
        recipientAddress: inputValue("#paymentRecipient"),
        lovelace: inputValue("#paymentLovelace"),
      }),
      sign,
      validateBeforeSign: (details) => ensureWalletMatchesAddress(details, dependencies.wallet().address),
      expectedSignerHashes: userAddressSigner,
      review: paymentReview,
      completion: "Pagamento concluído: a transação está incluída em um bloco da Preprod. Confira destino, valor e taxa no Cardanoscan.",
      readiness: dependencies.fundedReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    metadata: new FlowController({
      id: "metadata",
      title: "Pagamento com metadata",
      witnessIds: ["metadataWitness"],
      inputSelectors: ["#metadataRecipient", "#metadataLovelace", "#metadataMessage"],
      build: () => buildTx("/api/workshop/02-metadata", {
        userAddress: dependencies.wallet().address,
        recipientAddress: inputValue("#metadataRecipient"),
        lovelace: inputValue("#metadataLovelace"),
        message: inputValue("#metadataMessage"),
      }),
      sign,
      validateBeforeSign: (details) => ensureWalletMatchesAddress(details, dependencies.wallet().address),
      expectedSignerHashes: userAddressSigner,
      review: metadataReview,
      completion: "Metadata concluída: a transação está incluída. Abra o Cardanoscan e localize o label 674 e a mensagem publicada.",
      readiness: dependencies.fundedReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    multisigLock: new FlowController({
      id: "multisigLock",
      title: "Multisig lock",
      witnessIds: ["multisigLockWitness"],
      inputSelectors: ["#multisigSecondSigner", "#multisigLockLovelace"],
      build: () => buildTx("/api/workshop/03-multisig/lock", {
        ...multisigPayload(),
        lovelace: inputValue("#multisigLockLovelace"),
      }),
      sign,
      validateBeforeSign: (details) => {
        ensureMultisigSetupReady(dependencies.multisigSetupReady())
        ensureWalletMatchesAddress(details, dependencies.wallet().address, "firstSignerAddress")
      },
      validateBeforeSubmit: () => ensureMultisigSetupReady(dependencies.multisigSetupReady()),
      expectedSignerHashes: firstSignerAddressSigner,
      review: multisigLockReview,
      completion: "Lock incluído: agora use “Listar UTxOs do script”. Se o UTxO ainda não aparecer, aguarde a indexação e tente novamente.",
      readiness: dependencies.multisigLockReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    multisigUnlock: new FlowController({
      id: "multisigUnlock",
      title: "Multisig unlock",
      witnessIds: ["multisigUnlockWitnessA", "multisigUnlockWitnessB"],
      inputSelectors: ["#multisigSecondSigner", "#multisigDestination", "#multisigUnlockLovelace", "#multisigScriptUtxo"],
      editableUnsigned: true,
      editableWitnessIndexes: [1],
      inspectImported: inspectMultisigUnlock,
      signReview: {
        checkboxId: "multisigUnlockSignAcknowledge",
        summaryId: "multisigUnlockSignSummary",
        text: multisigUnlockReview,
      },
      build: () => buildTx("/api/workshop/03-multisig/unlock", {
        ...multisigPayload(),
        destinationAddress: inputValue("#multisigDestination"),
        lovelace: inputValue("#multisigUnlockLovelace"),
        scriptUtxo: inputValue("#multisigScriptUtxo"),
      }),
      sign,
      validateBeforeSign: (details) => verifyUnlockSigningContext(details, dependencies.wallet().address),
      review: multisigUnlockReview,
      completion: "Rodada de unlock incluída: o UTxO escolhido foi consumido e o valor saiu para o destino, mas o troco continua bloqueado no script. Para recuperar mais tADA, reinicie somente o unlock, liste o novo UTxO e repita com as duas wallets.",
      expectedSignerHashes: requiredSigners,
      readiness: dependencies.scriptSpendReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    eacMint: new FlowController({
      id: "eacMint",
      title: "Emissão EAC com metadata raw",
      witnessIds: ["eacMintWitness"],
      inputSelectors: ["#eacMintRecipient", "#eacMintMetadataJson"],
      build: () => buildTx("/api/workshop/04a-mint-eac", {
        userAddress: dependencies.wallet().address,
        recipientAddress: inputValue("#eacMintRecipient"),
        metadataJson: inputValue("#eacMintMetadataJson"),
      }),
      sign,
      validateBeforeSign: (details) => {
        ensureEacTransactionValidity(details)
        ensureWalletMatchesAddress(details, dependencies.wallet().address)
      },
      validateBeforeSubmit: ensureEacTransactionValidity,
      expectedSignerHashes: mintSigner,
      review: eacMintReview,
      completion: "Emissão ilustrativa incluída: confira 12088322 unidades no campo mint e aguarde a indexação antes de construir a aposentadoria.",
      readiness: dependencies.fundedReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    eacRetire: new FlowController({
      id: "eacRetire",
      title: "Aposentadoria EAC com burn",
      witnessIds: ["eacRetireWitness"],
      inputSelectors: ["#eacRetireMetadataJson"],
      build: () => buildTx("/api/workshop/04a-retire-eac", {
        userAddress: dependencies.wallet().address,
        metadataJson: inputValue("#eacRetireMetadataJson"),
      }),
      sign,
      validateBeforeSign: (details) => {
        ensureEacTransactionValidity(details)
        ensureWalletMatchesAddress(details, dependencies.wallet().address)
      },
      validateBeforeSubmit: ensureEacTransactionValidity,
      expectedSignerHashes: mintSigner,
      review: eacRetireReview,
      completion: "Aposentadoria incluída: confira burn de -125000 e saldo restante de 11963322 unidades no output da wallet.",
      readiness: dependencies.eacRetirementReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    mint: new FlowController({
      id: "mint",
      title: "Native Asset CIP-25",
      witnessIds: ["mintWitness"],
      inputSelectors: ["#mintRecipient", "#mintTokenName", "#mintAmount", "#mintMetadataName", "#mintImage", "#mintDescription"],
      build: () => buildTx("/api/workshop/04b-mint-cip25", {
        userAddress: dependencies.wallet().address,
        recipientAddress: inputValue("#mintRecipient"),
        tokenName: inputValue("#mintTokenName"),
        amount: inputValue("#mintAmount"),
        metadataName: inputValue("#mintMetadataName"),
        image: inputValue("#mintImage"),
        description: inputValue("#mintDescription"),
      }),
      sign,
      validateBeforeSign: (details) => {
        ensureMintValidity(details)
        ensureWalletMatchesAddress(details, dependencies.wallet().address)
      },
      validateBeforeSubmit: ensureMintValidity,
      expectedSignerHashes: mintSigner,
      review: mintReview,
      completion: "Mint concluído: a transação está incluída. Confira policy id, asset name, quantidade e metadata 721 no Cardanoscan.",
      readiness: dependencies.fundedReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
  }
}

export type WorkbenchFlowControllers = ReturnType<typeof createWorkbenchFlows>

const buildTx = (url: string, body: Record<string, string>): Promise<TxBuildResponse> =>
  postJson<TxBuildResponse>(url, body)

const userAddressSigner = (details: Record<string, unknown> | undefined): ReadonlyArray<string> | undefined =>
  signerFromAddress(details?.userAddress)

const firstSignerAddressSigner = (details: Record<string, unknown> | undefined): ReadonlyArray<string> | undefined =>
  signerFromAddress(details?.firstSignerAddress)

const mintSigner = (details: Record<string, unknown> | undefined): ReadonlyArray<string> | undefined =>
  typeof details?.requiredSigner === "string" ? [details.requiredSigner] : undefined

const signerFromAddress = (value: unknown): ReadonlyArray<string> | undefined => {
  if (typeof value !== "string") return undefined
  return [paymentKeyHash(value)]
}

const requiredSigners = (details: Record<string, unknown> | undefined): ReadonlyArray<string> | undefined => {
  const value = details?.requiredSigners
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value as Array<string>
    : undefined
}

const ensureMultisigSetupReady = (ready: boolean) => {
  if (!ready) throw new Error("Gere e confirme novamente o setup multisig antes de continuar")
}

const ensureWalletMatchesAddress = (
  details: Record<string, unknown> | undefined,
  walletAddress: string,
  field = "userAddress",
) => {
  const expectedAddress = details?.[field]
  if (typeof expectedAddress !== "string" || paymentKeyHash(expectedAddress) !== paymentKeyHash(walletAddress)) {
    throw new Error("A wallet conectada não corresponde à chave que construiu esta transação")
  }
}

const verifyUnlockSigningContext = async (
  details: Record<string, unknown> | undefined,
  walletAddress: string,
) => {
  ensureWalletIsRequiredSigner(details, walletAddress)
  const scriptAddress = details?.scriptAddress
  const scriptUtxo = details?.selectedScriptUtxo
  if (typeof scriptAddress !== "string" || typeof scriptUtxo !== "string") {
    throw new Error("O CBOR não informa script address e UTxO para verificação")
  }
  await postJson("/api/workshop/03-multisig/verify-input", { scriptAddress, scriptUtxo })
}

export const ensureWalletIsRequiredSigner = (
  details: Record<string, unknown> | undefined,
  walletAddress: string,
) => {
  const signers = requiredSigners(details)
  if (!signers?.includes(paymentKeyHash(walletAddress))) {
    throw new Error("A wallet conectada não pertence aos required signers deste unlock")
  }
}

const paymentKeyHash = (bech32: string): string =>
  KeyHash.toHex(expectKeyHash(Address.fromBech32(bech32).paymentCredential, "payment credential"))

export const ensureMintValidity = (details: Record<string, unknown> | undefined, now = Date.now()) => {
  const expiresAt = transactionExpiry(details)
  if (Number.isFinite(expiresAt) && expiresAt > now + 30_000) return
  throw new Error("A validade da policy do mint expirou ou está próxima do fim")
}

export const ensureEacTransactionValidity = (
  details: Record<string, unknown> | undefined,
  now = Date.now(),
) => {
  const expiresAt = transactionExpiry(details)
  if (Number.isFinite(expiresAt) && expiresAt > now + 30_000) return
  throw new Error("A janela de validade da transação EAC expirou ou está próxima do fim")
}

const transactionExpiry = (details: Record<string, unknown> | undefined): number => Number(
  typeof details?.transaction === "object" && details.transaction !== null
    ? (details.transaction as Record<string, unknown>).ttlUnixMs
    : undefined,
)

import { Address, KeyHash } from "@evolution-sdk/evolution"

import { expectKeyHash } from "../../../packages/cardano/src/internal/addresses.js"
import { messageRef, type Locale } from "../../../packages/localization/src/index.js"
import { FlowController } from "./flow-controller.js"
import { MessageError } from "./flow-errors.js"
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
  locale: () => Locale
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
      title: messageRef("flow.title.payment"),
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
      completion: messageRef("flow.completion.payment"),
      completionKind: "exercise",
      locale: dependencies.locale,
      readiness: dependencies.fundedReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    metadata: new FlowController({
      id: "metadata",
      title: messageRef("flow.title.metadata"),
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
      completion: messageRef("flow.completion.metadata"),
      completionKind: "exercise",
      locale: dependencies.locale,
      readiness: dependencies.fundedReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    multisigLock: new FlowController({
      id: "multisigLock",
      title: messageRef("flow.title.multisigLock"),
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
      completion: messageRef("flow.completion.multisigLock"),
      completionKind: "step",
      locale: dependencies.locale,
      readiness: dependencies.multisigLockReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    multisigUnlock: new FlowController({
      id: "multisigUnlock",
      title: messageRef("flow.title.multisigUnlock"),
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
      completion: messageRef("flow.completion.multisigUnlock"),
      completionKind: "exercise",
      locale: dependencies.locale,
      expectedSignerHashes: requiredSigners,
      readiness: dependencies.scriptSpendReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    eacMint: new FlowController({
      id: "eacMint",
      title: messageRef("flow.title.eacMint"),
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
      completion: messageRef("flow.completion.eacMint"),
      completionKind: "step",
      locale: dependencies.locale,
      readiness: dependencies.fundedReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    eacRetire: new FlowController({
      id: "eacRetire",
      title: messageRef("flow.title.eacRetire"),
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
      completion: messageRef("flow.completion.eacRetire"),
      completionKind: "exercise",
      locale: dependencies.locale,
      readiness: dependencies.eacRetirementReadiness,
      onChange: dependencies.onChange,
      log: dependencies.log,
    }),
    mint: new FlowController({
      id: "mint",
      title: messageRef("flow.title.mint"),
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
      completion: messageRef("flow.completion.mint"),
      completionKind: "exercise",
      locale: dependencies.locale,
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
  if (!ready) throw new MessageError(
    "multisig_setup_required",
    messageRef("multisig.error.setupRequired"),
  )
}

const ensureWalletMatchesAddress = (
  details: Record<string, unknown> | undefined,
  walletAddress: string,
  field = "userAddress",
) => {
  const expectedAddress = details?.[field]
  if (typeof expectedAddress !== "string" || paymentKeyHash(expectedAddress) !== paymentKeyHash(walletAddress)) {
    throw new MessageError("wallet_mismatch", messageRef("multisig.error.walletMismatch"))
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
    throw new MessageError("multisig_context_missing", messageRef("multisig.error.contextMissing"))
  }
  await postJson("/api/workshop/03-multisig/verify-input", { scriptAddress, scriptUtxo })
}

export const ensureWalletIsRequiredSigner = (
  details: Record<string, unknown> | undefined,
  walletAddress: string,
) => {
  const signers = requiredSigners(details)
  if (!signers?.includes(paymentKeyHash(walletAddress))) {
    throw new MessageError("wallet_not_required_signer", messageRef("multisig.error.notRequiredSigner"))
  }
}

const paymentKeyHash = (bech32: string): string =>
  KeyHash.toHex(expectKeyHash(Address.fromBech32(bech32).paymentCredential, "payment credential"))

export const ensureMintValidity = (details: Record<string, unknown> | undefined, now = Date.now()) => {
  const expiresAt = transactionExpiry(details)
  if (Number.isFinite(expiresAt) && expiresAt > now + 30_000) return
  throw new MessageError(
    "mint_transaction_expired",
    messageRef("flow.error.mintExpired.message"),
    messageRef("flow.error.mintExpired.guidance"),
    false,
  )
}

export const ensureEacTransactionValidity = (
  details: Record<string, unknown> | undefined,
  now = Date.now(),
) => {
  const expiresAt = transactionExpiry(details)
  if (Number.isFinite(expiresAt) && expiresAt > now + 30_000) return
  throw new MessageError(
    "eac_transaction_expired",
    messageRef("flow.error.eacExpired.message"),
    messageRef("flow.error.eacExpired.guidance"),
    false,
  )
}

const transactionExpiry = (details: Record<string, unknown> | undefined): number => Number(
  typeof details?.transaction === "object" && details.transaction !== null
    ? (details.transaction as Record<string, unknown>).ttlUnixMs
    : undefined,
)

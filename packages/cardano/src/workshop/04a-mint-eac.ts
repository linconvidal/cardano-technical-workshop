import {
  Address,
  Assets,
  Client,
  KeyHash,
  NativeScripts,
  ScriptHash,
  SlotConfig,
  Time,
  Transaction,
  TransactionMetadatum,
  preprod,
} from "@evolution-sdk/evolution"

import { expectKeyHash } from "../internal/addresses.js"
import { BLOCKFROST_PREPROD_URL, loadBlockfrostProjectId } from "../internal/blockfrost-client.js"
import { bytesToHex, textToAssetNameBytes } from "../internal/serialization.js"
import { summarizeTransaction } from "./transaction-summary.js"
import type {
  EacIssuanceMetadata,
  EacMintBuildParams,
  EacRetireBuildParams,
  EacRetirementMetadata,
  TxBuildResult,
} from "./types.js"

export const EAC_ASSET_NAME = "EAC-BRE-2025P01"
export const EAC_ISSUANCE_AMOUNT = 12_088_322n
export const EAC_METADATA_LABEL = 65_536n
export const EAC_RETIREMENT_AMOUNT = 125_000n
export const EAC_REMAINING_AMOUNT = EAC_ISSUANCE_AMOUNT - EAC_RETIREMENT_AMOUNT

const EAC_TX_TTL_MS = 3 * 60 * 60 * 1000
const MINT_OUTPUT_MIN_LOVELACE = 5_000_000n

export const buildEacMintTx = async (params: EacMintBuildParams): Promise<TxBuildResult> => {
  const userAddress = Address.fromBech32(params.userAddress)
  const recipientAddress = Address.fromBech32(params.recipientAddress)
  const userKeyHash = expectKeyHash(userAddress.paymentCredential, "user payment credential")

  const slotConfig = SlotConfig.getSlotConfig("Preprod")
  const requestedExpiry = BigInt(Date.now() + EAC_TX_TTL_MS)
  const expirySlot = Time.unixTimeToSlot(requestedExpiry, slotConfig)
  const expiresAt = Time.slotToUnixTime(expirySlot, slotConfig)

  // The stable signer-only policy permits later mint and burn operations by the same key.
  // The transaction TTL limits this build, but does not change the policy id.
  const mintPolicy = makeEacMintPolicy(userKeyHash)
  const policyId = ScriptHash.fromScript(mintPolicy)
  const policyIdHex = ScriptHash.toHex(policyId)
  const assetNameBytes = textToAssetNameBytes(EAC_ASSET_NAME)
  const assetNameHex = bytesToHex(assetNameBytes)

  const transactionMetadata = eacIssuanceMetadata(params.metadata)
  const provider = Client.make(preprod).withBlockfrost({
    baseUrl: BLOCKFROST_PREPROD_URL,
    projectId: loadBlockfrostProjectId(),
  })
  const existingBalance = await eacBalanceOf(provider, userAddress, policyIdHex, assetNameHex)
  if (existingBalance !== 0n) {
    throw new Error("A wallet já possui este EAC ilustrativo. Use uma wallet limpa ou conclua a aposentadoria antes de emitir novamente.")
  }

  const result = await provider
    .withAddress(params.userAddress)
    .newTx()
    .attachScript({ script: mintPolicy })
    .mintAssets({ assets: Assets.fromHexStrings(policyIdHex, assetNameHex, EAC_ISSUANCE_AMOUNT) })
    .payToAddress({
      address: recipientAddress,
      assets: Assets.fromHexStrings(
        policyIdHex,
        assetNameHex,
        EAC_ISSUANCE_AMOUNT,
        MINT_OUTPUT_MIN_LOVELACE,
      ),
    })
    .attachMetadata({ label: EAC_METADATA_LABEL, metadata: transactionMetadata })
    .addSigner({ keyHash: userKeyHash })
    .setValidity({ to: expiresAt })
    .build()

  const transaction = await result.toTransaction()

  return {
    txCbor: Transaction.toCBORHex(transaction),
    details: {
      kind: "eac-issuance-mint",
      userAddress: params.userAddress,
      recipientAddress: params.recipientAddress,
      tokenName: EAC_ASSET_NAME,
      amount: EAC_ISSUANCE_AMOUNT.toString(),
      displayedAmount: "12.088,322 EAC",
      assetNameHex,
      policyId: policyIdHex,
      policyScriptCbor: NativeScripts.toCBORHex(mintPolicy),
      policyScriptJson: JSON.stringify(NativeScripts.toJSON(mintPolicy.script), null, 2),
      policyRule: "signer-only; transaction metadata is not validated by the native policy",
      requiredSigner: KeyHash.toHex(userKeyHash),
      metadataLabel: EAC_METADATA_LABEL.toString(),
      metadataLabelPurpose: "CIP-10 private-use range; unregistered and not confidential",
      metadata: params.metadata,
      expiresAtUnixMs: expiresAt.toString(),
      transaction: summarizeTransaction(transaction),
    },
  }
}

export const buildEacRetirementTx = async (params: EacRetireBuildParams): Promise<TxBuildResult> => {
  const userAddress = Address.fromBech32(params.userAddress)
  const userKeyHash = expectKeyHash(userAddress.paymentCredential, "user payment credential")
  const slotConfig = SlotConfig.getSlotConfig("Preprod")
  const requestedExpiry = BigInt(Date.now() + EAC_TX_TTL_MS)
  const expirySlot = Time.unixTimeToSlot(requestedExpiry, slotConfig)
  const expiresAt = Time.slotToUnixTime(expirySlot, slotConfig)
  const mintPolicy = makeEacMintPolicy(userKeyHash)
  const policyId = ScriptHash.fromScript(mintPolicy)
  const policyIdHex = ScriptHash.toHex(policyId)
  const assetNameBytes = textToAssetNameBytes(EAC_ASSET_NAME)
  const assetNameHex = bytesToHex(assetNameBytes)

  const provider = Client.make(preprod).withBlockfrost({
    baseUrl: BLOCKFROST_PREPROD_URL,
    projectId: loadBlockfrostProjectId(),
  })
  const existingBalance = await eacBalanceOf(provider, userAddress, policyIdHex, assetNameHex)
  if (existingBalance !== EAC_ISSUANCE_AMOUNT) {
    throw new Error(`A aposentadoria exige saldo indexado de ${EAC_ISSUANCE_AMOUNT}; saldo localizado: ${existingBalance}`)
  }

  const result = await provider
    .withAddress(params.userAddress)
    .newTx()
    .attachScript({ script: mintPolicy })
    .mintAssets({ assets: Assets.fromHexStrings(policyIdHex, assetNameHex, -EAC_RETIREMENT_AMOUNT) })
    .payToAddress({
      address: userAddress,
      assets: Assets.fromHexStrings(
        policyIdHex,
        assetNameHex,
        EAC_REMAINING_AMOUNT,
        MINT_OUTPUT_MIN_LOVELACE,
      ),
    })
    .attachMetadata({ label: EAC_METADATA_LABEL, metadata: eacRetirementMetadata(params.metadata) })
    .addSigner({ keyHash: userKeyHash })
    .setValidity({ to: expiresAt })
    .build()

  const transaction = await result.toTransaction()
  return {
    txCbor: Transaction.toCBORHex(transaction),
    details: {
      kind: "eac-retirement-burn",
      userAddress: params.userAddress,
      recipientAddress: params.userAddress,
      tokenName: EAC_ASSET_NAME,
      amount: (-EAC_RETIREMENT_AMOUNT).toString(),
      remainingAmount: EAC_REMAINING_AMOUNT.toString(),
      assetNameHex,
      policyId: policyIdHex,
      policyScriptCbor: NativeScripts.toCBORHex(mintPolicy),
      policyScriptJson: JSON.stringify(NativeScripts.toJSON(mintPolicy.script), null, 2),
      policyRule: "signer-only; transaction metadata is not validated by the native policy",
      requiredSigner: KeyHash.toHex(userKeyHash),
      metadataLabel: EAC_METADATA_LABEL.toString(),
      metadataLabelPurpose: "CIP-10 private-use range; unregistered and not confidential",
      metadata: params.metadata,
      expiresAtUnixMs: expiresAt.toString(),
      transaction: summarizeTransaction(transaction),
    },
  }
}

const eacBalanceOf = async (
  provider: ReturnType<ReturnType<typeof Client.make>["withBlockfrost"]>,
  address: Address.Address,
  policyIdHex: string,
  assetNameHex: string,
): Promise<bigint> => {
  const utxos = await provider.getUtxos(address)
  return utxos.reduce((total, utxo) => {
    const quantity = utxo.assets.toJSON().multiAsset?.map[policyIdHex]?.[assetNameHex]
    return total + (quantity ? BigInt(quantity) : 0n)
  }, 0n)
}

export const makeEacMintPolicy = (keyHash: KeyHash.KeyHash) =>
  NativeScripts.makeScriptPubKey(KeyHash.toBytes(keyHash))

export const eacIssuanceMetadata = (
  metadata: EacIssuanceMetadata,
): TransactionMetadatum.Map =>
  TransactionMetadatum.fromEntries([
    ["version", 1n],
    ["unit", "EAC"],
    ["decimals", 3n],
    ["methodology_hash", metadata.methodology_hash],
    ["assurance_hash", metadata.assurance_hash],
    ["evidence_root", metadata.evidence_root],
  ])

export const eacRetirementMetadata = (
  metadata: EacRetirementMetadata,
): TransactionMetadatum.Map =>
  TransactionMetadatum.fromEntries([
    ["version", 1n],
    ["declaration_hash", metadata.declaration_hash],
    ["delivery_reference_hash", metadata.delivery_reference_hash],
  ])

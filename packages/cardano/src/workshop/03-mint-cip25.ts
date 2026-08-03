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
import type { MintBuildParams, TxBuildResult } from "./types.js"

const MINT_POLICY_TTL_MS = 3 * 60 * 60 * 1000
const MINT_OUTPUT_MIN_LOVELACE = 5_000_000n
const CIP25_METADATA_STRING_MAX_BYTES = 64
const textEncoder = new TextEncoder()

export const buildMintTx = async (params: MintBuildParams): Promise<TxBuildResult> => {
  const userAddress = Address.fromBech32(params.userAddress)
  const recipientAddress = Address.fromBech32(params.recipientAddress)
  const userKeyHash = expectKeyHash(userAddress.paymentCredential, "user payment credential")

  const slotConfig = SlotConfig.getSlotConfig("Preprod")
  const requestedExpiry = BigInt(Date.now() + MINT_POLICY_TTL_MS)
  const expirySlot = Time.unixTimeToSlot(requestedExpiry, slotConfig)
  const expiresAt = Time.slotToUnixTime(expirySlot, slotConfig)
  const signerScript = NativeScripts.makeScriptPubKey(KeyHash.toBytes(userKeyHash))
  const expiryScript = NativeScripts.makeInvalidHereafter(expirySlot)
  const mintPolicy = NativeScripts.makeScriptAll([signerScript.script, expiryScript.script])

  const policyId = ScriptHash.fromScript(mintPolicy)
  const policyIdHex = ScriptHash.toHex(policyId)
  const assetNameBytes = textToAssetNameBytes(params.tokenName)
  const assetNameHex = bytesToHex(assetNameBytes)

  const metadata = TransactionMetadatum.fromEntries([
    [
      ScriptHash.toBytes(policyId),
      TransactionMetadatum.fromEntries([
        [assetNameBytes, cip25TokenMetadata(params.metadataName, params.image, params.description)],
      ]),
    ],
    ["version", 2n],
  ])

  const result = await Client.make(preprod)
    .withBlockfrost({
      baseUrl: BLOCKFROST_PREPROD_URL,
      projectId: loadBlockfrostProjectId(),
    })
    .withAddress(params.userAddress)
    .newTx()
    .attachScript({ script: mintPolicy })
    .mintAssets({ assets: Assets.fromHexStrings(policyIdHex, assetNameHex, params.amount) })
    .payToAddress({
      address: recipientAddress,
      assets: Assets.fromHexStrings(policyIdHex, assetNameHex, params.amount, MINT_OUTPUT_MIN_LOVELACE),
    })
    .attachMetadata({ label: 721n, metadata })
    .addSigner({ keyHash: userKeyHash })
    .setValidity({ to: expiresAt })
    .build()

  const transaction = await result.toTransaction()

  return {
    txCbor: Transaction.toCBORHex(transaction),
    details: {
      kind: "cip25-mint",
      userAddress: params.userAddress,
      recipientAddress: params.recipientAddress,
      tokenName: params.tokenName,
      amount: params.amount.toString(),
      metadataName: params.metadataName,
      image: params.image,
      description: params.description,
      assetNameHex,
      policyId: policyIdHex,
      policyScriptCbor: NativeScripts.toCBORHex(mintPolicy),
      policyScriptJson: JSON.stringify(NativeScripts.toJSON(mintPolicy.script), null, 2),
      requiredSigner: KeyHash.toHex(userKeyHash),
      metadataLabel: "721",
      metadataVersion: "2",
      metadataKeyFormat: "byte strings for policy id and asset name",
      expiresAtUnixMs: expiresAt.toString(),
      transaction: summarizeTransaction(transaction),
    },
  }
}

export const cip25TokenMetadata = (
  metadataName: string,
  image: string,
  description: string,
): TransactionMetadatum.TransactionMetadatum =>
  TransactionMetadatum.fromEntries([
    ["name", requireShortCip25Text("name", metadataName)],
    ["image", cip25TextOrChunks(image)],
    ["description", cip25TextOrChunks(description)],
  ])

const requireShortCip25Text = (field: string, value: string): string => {
  const bytes = textEncoder.encode(value).length
  if (bytes <= CIP25_METADATA_STRING_MAX_BYTES) return value

  throw new Error(`CIP-25 ${field} must be at most ${CIP25_METADATA_STRING_MAX_BYTES} bytes, got ${bytes}`)
}

const cip25TextOrChunks = (value: string): string | ReadonlyArray<string> => {
  if (textEncoder.encode(value).length <= CIP25_METADATA_STRING_MAX_BYTES) return value

  const chunks: Array<string> = []
  let current = ""

  for (const character of value) {
    const next = current + character
    if (textEncoder.encode(next).length <= CIP25_METADATA_STRING_MAX_BYTES) {
      current = next
      continue
    }

    if (current) chunks.push(current)
    current = character
  }

  if (current) chunks.push(current)
  return chunks
}

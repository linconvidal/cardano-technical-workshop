import { Address, KeyHash, Transaction } from "@evolution-sdk/evolution"

import { expectKeyHash } from "../../../packages/cardano/src/internal/addresses.js"
import { WORKSHOP_NETWORK_CONFIG } from "../../../packages/cardano/src/internal/network-config.js"
import { validateTransactionVKeyWitnesses } from "../../../packages/cardano/src/internal/transaction-witnesses.js"
import { messageRef } from "../../../packages/localization/src/index.js"
import type {
  EacIssuanceMetadata,
  EacMintBuildParams,
  EacRetireBuildParams,
  EacRetirementMetadata,
  MetadataBuildParams,
  MintBuildParams,
  MultisigLockParams,
  MultisigParams,
  MultisigUnlockParams,
  PaymentBuildParams,
} from "../../../packages/cardano/src/workshop/types.js"
import { RequestValidationError } from "./api-error.js"

const MAX_LOVELACE = 45_000_000_000_000_000n
const MAX_ASSET_AMOUNT = 9_223_372_036_854_775_807n

type PaymentRequest = {
  userAddress?: unknown
  recipientAddress?: unknown
  lovelace?: unknown
}

type MetadataRequest = PaymentRequest & {
  message?: unknown
}

type MintRequest = {
  userAddress?: unknown
  recipientAddress?: unknown
  tokenName?: unknown
  amount?: unknown
  metadataName?: unknown
  image?: unknown
  description?: unknown
}

type EacMintRequest = {
  userAddress?: unknown
  recipientAddress?: unknown
  metadataJson?: unknown
}

type EacRetireRequest = {
  userAddress?: unknown
  metadataJson?: unknown
}

type MultisigRequest = {
  userAddress?: unknown
  secondSignerAddress?: unknown
}

type MultisigLockRequest = MultisigRequest & {
  lovelace?: unknown
}

type MultisigUnlockRequest = MultisigLockRequest & {
  destinationAddress?: unknown
  scriptUtxo?: unknown
}

type SubmitTxRequest = {
  signedTxCbor?: unknown
}

type MultisigInputVerificationRequest = {
  scriptAddress?: unknown
  scriptUtxo?: unknown
}

export const parsePaymentRequest = (body: PaymentRequest = {}): PaymentBuildParams => ({
  userAddress: parseTestnetAddress(body.userAddress, "userAddress"),
  recipientAddress: parseTestnetAddress(body.recipientAddress, "recipientAddress"),
  lovelace: parsePositiveBigInt(body.lovelace, "lovelace", MAX_LOVELACE),
})

export const parseMetadataRequest = (body: MetadataRequest = {}): MetadataBuildParams => ({
  ...parsePaymentRequest(body),
  message: requireBoundedString(body.message, "message", 64),
})

export const parseMintRequest = (body: MintRequest = {}): MintBuildParams => ({
  userAddress: parseTestnetAddress(body.userAddress, "userAddress"),
  recipientAddress: parseTestnetAddress(body.recipientAddress, "recipientAddress"),
  tokenName: requireBoundedString(body.tokenName, "tokenName", 32),
  amount: parsePositiveBigInt(body.amount, "amount", MAX_ASSET_AMOUNT),
  metadataName: requireBoundedString(body.metadataName, "metadataName", 64),
  image: requireBoundedString(body.image, "image", 2_048),
  description: requireBoundedString(body.description, "description", 2_048),
})

export const parseEacMintRequest = (body: EacMintRequest = {}): EacMintBuildParams => {
  const userAddress = parseTestnetAddress(body.userAddress, "userAddress")
  const recipientAddress = parseTestnetAddress(body.recipientAddress, "recipientAddress")
  if (userAddress !== recipientAddress) {
    throw new RequestValidationError(
      messageRef("api.validation.eacConnectedWallet"),
      "recipientAddress",
      messageRef("api.validation.eacConnectedWallet.guidance"),
    )
  }
  return { userAddress, recipientAddress, metadata: parseEacIssuanceMetadata(body.metadataJson) }
}

export const parseEacRetireRequest = (body: EacRetireRequest = {}): EacRetireBuildParams => ({
  userAddress: parseTestnetAddress(body.userAddress, "userAddress"),
  metadata: parseEacRetirementMetadata(body.metadataJson),
})

export const parseMultisigRequest = (body: MultisigRequest = {}): MultisigParams => {
  const userAddress = parseTestnetAddress(body.userAddress, "userAddress")
  const secondSignerAddress = parseTestnetAddress(body.secondSignerAddress, "secondSignerAddress")

  if (paymentKeyHash(userAddress) === paymentKeyHash(secondSignerAddress)) {
    throw new RequestValidationError(
      messageRef("api.validation.distinctSigners"),
      "secondSignerAddress",
      messageRef("api.validation.distinctSigners.guidance"),
    )
  }

  return { userAddress, secondSignerAddress }
}

export const parseMultisigLockRequest = (body: MultisigLockRequest = {}): MultisigLockParams => ({
  ...parseMultisigRequest(body),
  lovelace: parsePositiveBigInt(body.lovelace, "lovelace", MAX_LOVELACE),
})

export const parseMultisigUnlockRequest = (body: MultisigUnlockRequest = {}): MultisigUnlockParams => ({
  ...parseMultisigLockRequest(body),
  destinationAddress: parseTestnetAddress(body.destinationAddress, "destinationAddress"),
  scriptUtxo: optionalOutRef(body.scriptUtxo),
})

export const parseSubmitTxRequest = (body: SubmitTxRequest = {}): string => {
  const cbor = requireHex(body.signedTxCbor, "signedTxCbor")
  let transaction: Transaction.Transaction
  try {
    transaction = Transaction.fromCBORHex(cbor)
  } catch {
    throw new RequestValidationError(
      messageRef("api.validation.signedTransaction"),
      "signedTxCbor",
      messageRef("api.validation.signedTransaction.guidance"),
    )
  }

  try {
    validateTransactionVKeyWitnesses(transaction)
  } catch {
    throw new RequestValidationError(
      messageRef("api.validation.signedTransaction"),
      "signedTxCbor",
      messageRef("api.validation.signedTransaction.guidance"),
    )
  }

  if (transaction.body.outputs.some((output) => output.address.networkId !== WORKSHOP_NETWORK_CONFIG.networkId)) {
    throw new RequestValidationError(
      messageRef("api.validation.submissionNetwork"),
      "signedTxCbor",
      messageRef("api.validation.submissionNetwork.guidance"),
    )
  }
  return cbor
}

export const parseMultisigInputVerificationRequest = (
  body: MultisigInputVerificationRequest = {},
): { scriptAddress: string; scriptUtxo: string } => {
  const scriptAddress = parseTestnetAddress(body.scriptAddress, "scriptAddress")
  if (Address.fromBech32(scriptAddress).paymentCredential._tag !== "ScriptHash") {
    throw new RequestValidationError(messageRef("api.validation.scriptCredential"), "scriptAddress")
  }
  const scriptUtxo = optionalOutRef(body.scriptUtxo)
  if (!scriptUtxo) throw new RequestValidationError(messageRef("api.validation.scriptUtxoRequired"), "scriptUtxo")
  return { scriptAddress, scriptUtxo }
}

export const parseTransactionHash = (value: unknown): string => {
  const txHash = requireString(value, "txHash")
  if (/^[0-9a-fA-F]{64}$/.test(txHash)) return txHash.toLowerCase()
  throw new RequestValidationError(messageRef("api.validation.transactionHash"), "txHash")
}

const EAC_METADATA_KEYS = [
  "assurance_hash",
  "decimals",
  "evidence_root",
  "methodology_hash",
  "unit",
  "version",
] as const

const parseEacIssuanceMetadata = (value: unknown): EacIssuanceMetadata => {
  const raw = requireBoundedString(value, "metadataJson", 4_096)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RequestValidationError(
      messageRef("api.validation.validMetadataJson"),
      "metadataJson",
      messageRef("api.validation.issuanceMetadataJson.guidance"),
    )
  }

  if (!isRecord(parsed)) {
    throw new RequestValidationError(messageRef("api.validation.metadataJsonObject"), "metadataJson")
  }

  const keys = Object.keys(parsed).sort()
  if (keys.length !== EAC_METADATA_KEYS.length || keys.some((key, index) => key !== EAC_METADATA_KEYS[index])) {
    throw new RequestValidationError(
      messageRef("api.validation.metadataExactKeys", { keys: EAC_METADATA_KEYS.join(", ") }),
      "metadataJson",
      messageRef("api.validation.issuanceMetadataKeys.guidance"),
    )
  }

  if (parsed.version !== 1 || parsed.unit !== "EAC" || parsed.decimals !== 3) {
    throw new RequestValidationError(
      messageRef("api.validation.issuanceMetadataConstants"),
      "metadataJson",
    )
  }

  return {
    version: 1,
    unit: "EAC",
    decimals: 3,
    methodology_hash: requireCanonicalHash(parsed.methodology_hash, "methodology_hash"),
    assurance_hash: requireCanonicalHash(parsed.assurance_hash, "assurance_hash"),
    evidence_root: requireCanonicalHash(parsed.evidence_root, "evidence_root"),
  }
}

const parseEacRetirementMetadata = (value: unknown): EacRetirementMetadata => {
  const raw = requireBoundedString(value, "metadataJson", 4_096)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new RequestValidationError(messageRef("api.validation.validMetadataJson"), "metadataJson")
  }
  if (!isRecord(parsed)) {
    throw new RequestValidationError(messageRef("api.validation.metadataJsonObject"), "metadataJson")
  }
  const expected = ["declaration_hash", "delivery_reference_hash", "version"]
  const keys = Object.keys(parsed).sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new RequestValidationError(
      messageRef("api.validation.metadataExactKeys", { keys: expected.join(", ") }),
      "metadataJson",
      messageRef("api.validation.retirementMetadataKeys.guidance"),
    )
  }
  if (parsed.version !== 1) {
    throw new RequestValidationError(messageRef("api.validation.retirementMetadataVersion"), "metadataJson")
  }
  return {
    version: 1,
    declaration_hash: requireCanonicalHash(parsed.declaration_hash, "declaration_hash"),
    delivery_reference_hash: requireCanonicalHash(parsed.delivery_reference_hash, "delivery_reference_hash"),
  }
}

const requireCanonicalHash = (value: unknown, field: string): string => {
  if (typeof value === "string" && /^[0-9a-f]{64}$/.test(value)) return value
  throw new RequestValidationError(
    messageRef("api.validation.canonicalHash", { field }),
    "metadataJson",
  )
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const requireString = (value: unknown, field: string): string => {
  if (typeof value === "string" && value.trim()) return value.trim()
  throw new RequestValidationError(messageRef("api.validation.required", { field }), field)
}

const requireBoundedString = (value: unknown, field: string, maximumUtf8Bytes: number): string => {
  const parsed = requireString(value, field)
  if (Buffer.byteLength(parsed, "utf8") <= maximumUtf8Bytes) return parsed
  throw new RequestValidationError(messageRef("api.validation.tooLong", { field, maximumUtf8Bytes }), field)
}

const requireHex = (value: unknown, field: string): string => {
  const clean = requireString(value, field).replace(/^0x/, "")
  if (clean.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(clean)) return clean
  throw new RequestValidationError(messageRef("api.validation.validHexCbor", { field }), field)
}

const optionalOutRef = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined
  const outRef = requireString(value, "scriptUtxo")
  if (/^[0-9a-fA-F]{64}#\d+$/.test(outRef)) return outRef.toLowerCase()
  throw new RequestValidationError(messageRef("api.validation.scriptUtxoFormat"), "scriptUtxo")
}

const parsePositiveBigInt = (value: unknown, field: string, maximum: bigint): bigint => {
  let parsed: bigint
  if (typeof value === "number" && Number.isSafeInteger(value)) parsed = BigInt(value)
  else if (typeof value === "string" && /^\d+$/.test(value)) parsed = BigInt(value)
  else throw new RequestValidationError(messageRef("api.validation.positiveInteger", { field }), field)

  if (parsed <= 0n) throw new RequestValidationError(messageRef("api.validation.greaterThanZero", { field }), field)
  if (parsed > maximum) throw new RequestValidationError(messageRef("api.validation.maximum", { field }), field)
  return parsed
}

export const parseTestnetAddress = (value: unknown, field = "address"): string => {
  const bech32 = requireBoundedString(value, field, 200)

  try {
    const address = Address.fromBech32(bech32)
    if (address.networkId !== 0) {
      throw new RequestValidationError(
        messageRef("api.validation.testnetAddress", { field }),
        field,
        messageRef("api.validation.testnetAddress.guidance"),
      )
    }
    return Address.toBech32(address)
  } catch (error) {
    if (error instanceof RequestValidationError) throw error
    throw new RequestValidationError(
      messageRef("api.validation.cardanoAddress", { field }),
      field,
      messageRef("api.validation.cardanoAddress.guidance"),
    )
  }
}

const paymentKeyHash = (bech32: string): string => {
  const address = Address.fromBech32(bech32)
  return KeyHash.toHex(expectKeyHash(address.paymentCredential, "payment credential"))
}

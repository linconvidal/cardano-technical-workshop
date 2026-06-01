import type {
  MetadataBuildParams,
  MintBuildParams,
  MultisigLockParams,
  MultisigParams,
  MultisigUnlockParams,
  PaymentBuildParams,
} from "../../../packages/cardano/src/workshop/types.js"

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

export const parsePaymentRequest = (body: PaymentRequest): PaymentBuildParams => ({
  userAddress: requireString(body.userAddress, "userAddress"),
  recipientAddress: requireString(body.recipientAddress, "recipientAddress"),
  lovelace: parseBigInt(body.lovelace, "lovelace"),
})

export const parseMetadataRequest = (body: MetadataRequest): MetadataBuildParams => ({
  ...parsePaymentRequest(body),
  message: requireString(body.message, "message"),
})

export const parseMintRequest = (body: MintRequest): MintBuildParams => ({
  userAddress: requireString(body.userAddress, "userAddress"),
  recipientAddress: requireString(body.recipientAddress, "recipientAddress"),
  tokenName: requireString(body.tokenName, "tokenName"),
  amount: parseBigInt(body.amount, "amount"),
  metadataName: requireString(body.metadataName, "metadataName"),
  image: requireString(body.image, "image"),
  description: requireString(body.description, "description"),
})

export const parseMultisigRequest = (body: MultisigRequest): MultisigParams => ({
  userAddress: requireString(body.userAddress, "userAddress"),
  secondSignerAddress: requireString(body.secondSignerAddress, "secondSignerAddress"),
})

export const parseMultisigLockRequest = (body: MultisigLockRequest): MultisigLockParams => ({
  ...parseMultisigRequest(body),
  lovelace: parseBigInt(body.lovelace, "lovelace"),
})

export const parseMultisigUnlockRequest = (body: MultisigUnlockRequest): MultisigUnlockParams => ({
  ...parseMultisigLockRequest(body),
  destinationAddress: requireString(body.destinationAddress, "destinationAddress"),
  scriptUtxo: optionalString(body.scriptUtxo),
})

export const parseSubmitTxRequest = (body: SubmitTxRequest): string => requireString(body.signedTxCbor, "signedTxCbor")

const requireString = (value: unknown, field: string): string => {
  if (typeof value === "string" && value.trim()) return value.trim()
  throw new Error(`Missing or invalid ${field}`)
}

const optionalString = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim()
  return undefined
}

const parseBigInt = (value: unknown, field: string): bigint => {
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value)
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value)
  throw new Error(`Missing or invalid ${field}`)
}

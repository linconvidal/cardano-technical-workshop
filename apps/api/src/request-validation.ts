import { Address, KeyHash, Transaction } from "@evolution-sdk/evolution"

import { expectKeyHash } from "../../../packages/cardano/src/internal/addresses.js"
import type {
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

export const parseMultisigRequest = (body: MultisigRequest = {}): MultisigParams => {
  const userAddress = parseTestnetAddress(body.userAddress, "userAddress")
  const secondSignerAddress = parseTestnetAddress(body.secondSignerAddress, "secondSignerAddress")

  if (paymentKeyHash(userAddress) === paymentKeyHash(secondSignerAddress)) {
    throw new RequestValidationError(
      "Os dois signers precisam usar chaves de pagamento diferentes",
      "secondSignerAddress",
      "Conecte ou informe uma segunda wallet com outra chave de pagamento.",
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
  try {
    Transaction.fromCBORHex(cbor)
    return cbor
  } catch {
    throw new RequestValidationError(
      "signedTxCbor não representa uma transação Cardano válida",
      "signedTxCbor",
      "Use o signed tx CBOR produzido pela etapa de anexar witnesses.",
    )
  }
}

export const parseMultisigInputVerificationRequest = (
  body: MultisigInputVerificationRequest = {},
): { scriptAddress: string; scriptUtxo: string } => {
  const scriptAddress = parseTestnetAddress(body.scriptAddress, "scriptAddress")
  if (Address.fromBech32(scriptAddress).paymentCredential._tag !== "ScriptHash") {
    throw new RequestValidationError("scriptAddress precisa usar uma credencial de script", "scriptAddress")
  }
  const scriptUtxo = optionalOutRef(body.scriptUtxo)
  if (!scriptUtxo) throw new RequestValidationError("scriptUtxo é obrigatório", "scriptUtxo")
  return { scriptAddress, scriptUtxo }
}

export const parseTransactionHash = (value: unknown): string => {
  const txHash = requireString(value, "txHash")
  if (/^[0-9a-fA-F]{64}$/.test(txHash)) return txHash.toLowerCase()
  throw new RequestValidationError("txHash precisa ter 64 caracteres hexadecimais", "txHash")
}

const requireString = (value: unknown, field: string): string => {
  if (typeof value === "string" && value.trim()) return value.trim()
  throw new RequestValidationError(`Campo obrigatório ou inválido: ${field}`, field)
}

const requireBoundedString = (value: unknown, field: string, maximumUtf8Bytes: number): string => {
  const parsed = requireString(value, field)
  if (Buffer.byteLength(parsed, "utf8") <= maximumUtf8Bytes) return parsed
  throw new RequestValidationError(`${field} excede ${maximumUtf8Bytes} bytes em UTF-8`, field)
}

const requireHex = (value: unknown, field: string): string => {
  const clean = requireString(value, field).replace(/^0x/, "")
  if (clean.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(clean)) return clean
  throw new RequestValidationError(`${field} precisa ser CBOR hexadecimal válido`, field)
}

const optionalOutRef = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined
  const outRef = requireString(value, "scriptUtxo")
  if (/^[0-9a-fA-F]{64}#\d+$/.test(outRef)) return outRef.toLowerCase()
  throw new RequestValidationError("scriptUtxo precisa usar o formato txhash#index", "scriptUtxo")
}

const parsePositiveBigInt = (value: unknown, field: string, maximum: bigint): bigint => {
  let parsed: bigint
  if (typeof value === "number" && Number.isSafeInteger(value)) parsed = BigInt(value)
  else if (typeof value === "string" && /^\d+$/.test(value)) parsed = BigInt(value)
  else throw new RequestValidationError(`${field} precisa ser um número inteiro positivo`, field)

  if (parsed <= 0n) throw new RequestValidationError(`${field} precisa ser maior que zero`, field)
  if (parsed > maximum) throw new RequestValidationError(`${field} excede o limite aceito`, field)
  return parsed
}

export const parseTestnetAddress = (value: unknown, field = "address"): string => {
  const bech32 = requireBoundedString(value, field, 200)

  try {
    const address = Address.fromBech32(bech32)
    if (address.networkId !== 0) {
      throw new RequestValidationError(
        `${field} precisa ser um endereço de testnet`,
        field,
        "Selecione Cardano Preprod na wallet e use um endereço addr_test.",
      )
    }
    return Address.toBech32(address)
  } catch (error) {
    if (error instanceof RequestValidationError) throw error
    throw new RequestValidationError(
      `${field} não é um endereço Cardano válido`,
      field,
      "Use um endereço addr_test da rede Preprod.",
    )
  }
}

const paymentKeyHash = (bech32: string): string => {
  const address = Address.fromBech32(bech32)
  return KeyHash.toHex(expectKeyHash(address.paymentCredential, "payment credential"))
}

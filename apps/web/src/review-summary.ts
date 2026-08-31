import {
  formatDateTime,
  formatMessage,
  formatScaledBigInt,
  messageRef,
  type Locale,
  type MessageKey,
  type MessageRef,
} from "../../../packages/localization/src/index.js"

export type ReviewSummary = (details: Record<string, unknown> | undefined, locale: Locale) => MessageRef

export const paymentReview: ReviewSummary = (details, locale) => {
  if (!details) return messageRef("review.unavailable.transaction")
  const recipient = text(details.recipientAddress, locale)
  return messageRef("review.payment", {
    network: network(details),
    lovelace: lovelaceAt(details, recipient, locale),
    recipient: short(recipient),
    fee: fee(details, locale),
  })
}

export const metadataReview: ReviewSummary = (details, locale) => {
  if (!details) return messageRef("review.unavailable.transaction")
  const recipient = text(details.recipientAddress, locale)
  const metadata = record(record(details.transaction)?.auxiliaryData)
  return messageRef("review.metadata", {
    network: network(details),
    lovelace: lovelaceAt(details, recipient, locale),
    recipient: short(recipient),
    message: text(record(metadata?.["674"])?.msg, locale),
    fee: fee(details, locale),
  })
}

export const mintReview: ReviewSummary = (details, locale) => {
  if (!details) return messageRef("review.unavailable.mint")
  const policyId = text(details.policyId, locale)
  const assetNameHex = text(details.assetNameHex, locale)
  const recipient = text(details.recipientAddress, locale)
  const quantity = mintAmount(details, policyId, assetNameHex, locale)
  return messageRef("review.mint", {
    network: network(details),
    quantity,
    unitLabel: localizedValue(quantity === "1" ? "review.unit.one" : "review.unit.other", locale),
    tokenName: text(details.tokenName, locale),
    outputQuantity: assetAmountAt(details, recipient, policyId, assetNameHex, locale),
    recipient: short(recipient),
    policyId: short(policyId),
    expiry: expiryText(details, locale),
    fee: fee(details, locale),
  })
}

export const eacMintReview: ReviewSummary = (details, locale) => {
  if (!details) return messageRef("review.unavailable.eacMint")
  const transaction = record(details.transaction)
  const policyId = text(details.policyId, locale)
  const assetNameHex = text(details.assetNameHex, locale)
  const recipient = text(details.recipientAddress, locale)
  const rawQuantity = mintAmount(details, policyId, assetNameHex, locale)
  const rawOutputQuantity = assetAmountAt(details, recipient, policyId, assetNameHex, locale)
  const metadata = record(record(transaction?.auxiliaryData)?.["65536"])
  return messageRef("review.eacMint", {
    network: network(details),
    quantity: formatBaseUnits(rawQuantity, locale),
    displayQuantity: formatEac(rawQuantity, locale),
    tokenName: text(details.tokenName, locale),
    outputQuantity: formatBaseUnits(rawOutputQuantity, locale),
    recipient: short(recipient),
    version: text(metadata?.version, locale),
    unit: text(metadata?.unit, locale),
    decimals: text(metadata?.decimals, locale),
    expiry: expiryText(details, locale),
    fee: fee(details, locale),
  })
}

export const eacRetireReview: ReviewSummary = (details, locale) => {
  if (!details) return messageRef("review.unavailable.eacRetire")
  const transaction = record(details.transaction)
  const policyId = text(details.policyId, locale)
  const assetNameHex = text(details.assetNameHex, locale)
  const recipient = text(details.recipientAddress, locale)
  const rawQuantity = mintAmount(details, policyId, assetNameHex, locale)
  const rawRemaining = assetAmountAt(details, recipient, policyId, assetNameHex, locale)
  const metadata = record(record(transaction?.auxiliaryData)?.["65536"])
  return messageRef("review.eacRetire", {
    network: network(details),
    quantity: formatBaseUnits(rawQuantity, locale),
    displayQuantity: formatEac(rawQuantity.replace("-", ""), locale),
    tokenName: text(details.tokenName, locale),
    remaining: formatBaseUnits(rawRemaining, locale),
    displayRemaining: formatEac(rawRemaining, locale),
    recipient: short(recipient),
    version: text(metadata?.version, locale),
    expiry: expiryText(details, locale),
    fee: fee(details, locale),
  })
}

export const multisigLockReview: ReviewSummary = (details, locale) => {
  if (!details) return messageRef("review.unavailable.multisigLock")
  const scriptAddress = text(details.scriptAddress, locale)
  return messageRef("review.multisigLock", {
    network: network(details),
    lovelace: lovelaceAt(details, scriptAddress, locale),
    scriptAddress: short(scriptAddress),
    fee: fee(details, locale),
  })
}

export const multisigUnlockReview: ReviewSummary = (details, locale) => {
  if (!details) return messageRef("review.unavailable.multisigUnlock")
  const destination = text(details.destinationAddress, locale)
  const scriptAddress = text(details.scriptAddress, locale)
  const signers = Array.isArray(details.requiredSigners)
    ? details.requiredSigners.map((signer) => short(text(signer, locale))).join(" + ")
    : localizedValue("review.value.unavailable", locale)
  return messageRef("review.multisigUnlock", {
    network: network(details),
    input: short(text(details.selectedScriptUtxo, locale)),
    destinationLovelace: lovelaceAt(details, destination, locale),
    destination: short(destination),
    changeLovelace: lovelaceAt(details, scriptAddress, locale),
    signers,
    fee: fee(details, locale),
  })
}

const network = (details: Record<string, unknown>): string => {
  const value = String(record(details.transaction)?.network ?? details.network ?? "")
  return value === "testnet" ? "Testnet" : value
}

const mintAmount = (
  details: Record<string, unknown>,
  policyId: string,
  assetNameHex: string,
  locale: Locale,
): string => text(record(record(record(record(details.transaction)?.mint)?.map)?.[policyId])?.[assetNameHex], locale)

const assetAmountAt = (
  details: Record<string, unknown>,
  address: string,
  policyId: string,
  assetNameHex: string,
  locale: Locale,
): string => {
  const output = outputAt(details, address)
  const multiAsset = record(record(output?.assets)?.multiAsset)
  return text(record(record(multiAsset?.map)?.[policyId])?.[assetNameHex], locale)
}

const outputAt = (details: Record<string, unknown>, address: string): Record<string, unknown> | undefined => {
  const transaction = record(details.transaction)
  const outputs = Array.isArray(transaction?.outputs) ? transaction.outputs : []
  return outputs.map(record).find((candidate) => candidate?.address === address)
}

const lovelaceAt = (details: Record<string, unknown>, address: string, locale: Locale): string => {
  const output = outputAt(details, address)
  return output ? text(output.lovelace, locale) : localizedValue("review.value.notFound", locale)
}

const fee = (details: Record<string, unknown>, locale: Locale): string => {
  const transaction = record(details.transaction)
  return transaction ? text(transaction.feeLovelace, locale) : localizedValue("review.value.unavailable", locale)
}

const expiryText = (details: Record<string, unknown>, locale: Locale): string => {
  const expiresAt = Number(record(details.transaction)?.ttlUnixMs)
  return Number.isFinite(expiresAt)
    ? formatDateTime(expiresAt, locale, { dateStyle: "short", timeStyle: "medium" })
    : localizedValue("review.value.unavailable", locale)
}

const formatBaseUnits = (raw: string, locale: Locale): string => {
  try {
    return formatScaledBigInt(BigInt(raw), 0, locale, { maximumFractionDigits: 0 })
  } catch {
    return localizedValue("review.value.quantityUnavailable", locale)
  }
}

const formatEac = (raw: string, locale: Locale): string => {
  try {
    return `${formatScaledBigInt(BigInt(raw), 3, locale, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    })} EAC`
  } catch {
    return localizedValue("review.value.quantityUnavailable", locale)
  }
}

const localizedValue = (key: MessageKey, locale: Locale): string => formatMessage(messageRef(key), locale)

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined

const text = (value: unknown, locale: Locale): string =>
  value === undefined || value === null ? localizedValue("review.value.unavailable", locale) : String(value)

const short = (value: string): string => value.length > 30 ? `${value.slice(0, 14)}...${value.slice(-10)}` : value

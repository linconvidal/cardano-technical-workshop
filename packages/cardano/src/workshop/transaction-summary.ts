import {
  Address,
  Assets,
  SlotConfig,
  Time,
  Transaction,
  TransactionBody,
  TransactionHash,
} from "@evolution-sdk/evolution"

import { bytesToHex } from "../internal/serialization.js"

export const summarizeTransaction = (transaction: Transaction.Transaction) => {
  const body = transaction.body.toJSON()

  return {
    transactionHash: TransactionHash.toHex(TransactionBody.toHash(transaction.body)),
    network: outputsUseTestnet(transaction) ? "testnet" : "mainnet-or-mixed",
    feeLovelace: transaction.body.fee.toString(),
    inputCount: transaction.body.inputs.length,
    outputCount: transaction.body.outputs.length,
    inputs: transaction.body.inputs.map((input) => ({
      outRef: `${TransactionHash.toHex(input.transactionId)}#${input.index}`,
    })),
    outputs: transaction.body.outputs.map((output) => ({
      address: Address.toBech32(output.address),
      lovelace: Assets.lovelaceOf(output.assets).toString(),
      assets: output.assets.toJSON(),
    })),
    mint: body.mint,
    certificates: body.certificates,
    withdrawals: body.withdrawals,
    auxiliaryDataHash: body.auxiliaryDataHash,
    scriptDataHash: body.scriptDataHash,
    collateralInputs: body.collateralInputs,
    collateralReturn: body.collateralReturn,
    totalCollateral: body.totalCollateral,
    referenceInputs: body.referenceInputs,
    votingProcedures: body.votingProcedures,
    proposalProcedures: body.proposalProcedures,
    currentTreasuryValue: body.currentTreasuryValue,
    donation: body.donation,
    requiredSigners: (transaction.body.requiredSigners ?? []).map((keyHash) => keyHash.toJSON()),
    validityIntervalStart: body.validityIntervalStart,
    ttl: body.ttl,
    ttlUnixMs: transaction.body.ttl === undefined
      ? null
      : Time.slotToUnixTime(transaction.body.ttl, SlotConfig.getSlotConfig("Preprod")).toString(),
    auxiliaryData: transaction.auxiliaryData?.metadata
      ? Object.fromEntries(
        [...transaction.auxiliaryData.metadata].map(([label, metadata]) => [label.toString(), summarizeMetadatum(metadata)]),
      )
      : null,
  }
}

const outputsUseTestnet = (transaction: Transaction.Transaction): boolean =>
  transaction.body.outputs.length > 0 && transaction.body.outputs.every((output) => output.address.networkId === 0)

const summarizeMetadatum = (value: unknown): unknown => {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Uint8Array) return `0x${bytesToHex(value)}`
  if (Array.isArray(value)) return value.map(summarizeMetadatum)
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value].map(([key, entry]) => [metadataKey(key), summarizeMetadatum(entry)]),
    )
  }
  return value
}

const metadataKey = (value: unknown): string => {
  const summarized = summarizeMetadatum(value)
  return typeof summarized === "string" ? summarized : JSON.stringify(summarized)
}

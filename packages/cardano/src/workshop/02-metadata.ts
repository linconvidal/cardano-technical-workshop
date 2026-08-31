import { Address, Assets, Transaction, TransactionMetadatum } from "@evolution-sdk/evolution"

import { makeWorkshopBlockfrostClient } from "../internal/blockfrost-client.js"
import { summarizeTransaction } from "./transaction-summary.js"
import type { MetadataBuildParams, TxBuildResult } from "./types.js"

export const buildMetadataTx = async (params: MetadataBuildParams): Promise<TxBuildResult> => {
  const client = makeWorkshopBlockfrostClient().withAddress(params.userAddress)

  const metadata = TransactionMetadatum.fromEntries([["msg", params.message]])

  const result = await client
    .newTx()
    .payToAddress({
      address: Address.fromBech32(params.recipientAddress),
      assets: Assets.fromLovelace(params.lovelace),
    })
    .attachMetadata({ label: 674n, metadata })
    .build()

  const transaction = await result.toTransaction()

  return {
    txCbor: Transaction.toCBORHex(transaction),
    details: {
      kind: "metadata-payment",
      label: "674",
      message: params.message,
      userAddress: params.userAddress,
      recipientAddress: params.recipientAddress,
      lovelace: params.lovelace.toString(),
      transaction: summarizeTransaction(transaction),
    },
  }
}

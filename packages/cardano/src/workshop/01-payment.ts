import { Address, Assets, Client, Transaction, preprod } from "@evolution-sdk/evolution"

import { BLOCKFROST_PREPROD_URL, loadBlockfrostProjectId } from "../internal/blockfrost-client.js"
import type { PaymentBuildParams, TxBuildResult } from "./types.js"

export const buildPaymentTx = async (params: PaymentBuildParams): Promise<TxBuildResult> => {
  const client = Client.make(preprod)
    .withBlockfrost({
      baseUrl: BLOCKFROST_PREPROD_URL,
      projectId: loadBlockfrostProjectId(),
    })
    .withAddress(params.userAddress)

  const result = await client
    .newTx()
    .payToAddress({
      address: Address.fromBech32(params.recipientAddress),
      assets: Assets.fromLovelace(params.lovelace),
    })
    .build()

  const transaction = await result.toTransaction()

  return {
    txCbor: Transaction.toCBORHex(transaction),
    details: {
      kind: "payment",
      userAddress: params.userAddress,
      recipientAddress: params.recipientAddress,
      lovelace: params.lovelace.toString(),
    },
  }
}

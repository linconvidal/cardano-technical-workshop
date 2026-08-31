import {
  Address,
  AssetName,
  Assets,
  KeyHash,
  PolicyId,
  Transaction,
} from "@evolution-sdk/evolution"

type BlockfrostAmount = { unit: string; quantity: string }
export type BlockfrostUtxo = ReturnType<typeof blockfrostUtxo>

const protocolParameters = {
  min_fee_a: 44,
  min_fee_b: 155_381,
  pool_deposit: "500000000",
  key_deposit: "2000000",
  max_tx_size: 16_384,
  max_val_size: "5000",
  max_block_size: 90_112,
  coins_per_utxo_size: "4310",
  collateral_percent: 150,
  max_collateral_inputs: 3,
  min_fee_ref_script_cost_per_byte: 15,
  cost_models_raw: { PlutusV1: [], PlutusV2: [], PlutusV3: [] },
}

export const addressFor = (hexDigit: string): string => Address.toBech32(new Address.Address({
  networkId: 0,
  paymentCredential: KeyHash.fromHex(hexDigit.repeat(56)),
}))

export const blockfrostUtxo = (
  address: string,
  txHash: string,
  amounts: ReadonlyArray<BlockfrostAmount>,
) => ({
  address,
  tx_hash: txHash,
  tx_index: 0,
  output_index: 0,
  amount: amounts,
  block: "b".repeat(64),
  data_hash: null,
  inline_datum: null,
  reference_script_hash: null,
})

export const lovelace = (quantity = "100000000"): BlockfrostAmount => ({ unit: "lovelace", quantity })

export const transaction = (cbor: string): Transaction.Transaction => Transaction.fromCBORHex(cbor)

export const outputLovelaceAt = (tx: Transaction.Transaction, address: string): bigint | undefined =>
  tx.body.outputs
    .filter((output) => Address.toBech32(output.address) === address)
    .map((output) => Assets.lovelaceOf(output.assets))
    .find((amount) => amount > 0n)

export const assetQuantityAt = (
  tx: Transaction.Transaction,
  address: string,
  policyId: string,
  assetName: string,
): string | undefined => tx.body.outputs
  .find((output) => Address.toBech32(output.address) === address)
  ?.assets.toJSON().multiAsset?.map[policyId]?.[assetName]

export const mintQuantity = (
  tx: Transaction.Transaction,
  policyId: string,
  assetName: string,
): bigint | undefined => {
  const assets = [...(tx.body.mint?.map ?? [])]
    .find(([policy]) => PolicyId.toHex(policy) === policyId)?.[1]
  return [...(assets ?? [])].find(([asset]) => AssetName.toHex(asset) === assetName)?.[1]
}

export const installControlledBlockfrost = () => {
  const originalFetch = globalThis.fetch
  const originalProjectId = process.env.BLOCKFROST_PROJECT_ID
  const utxosByAddress = new Map<string, ReadonlyArray<BlockfrostUtxo>>()
  const requests: Array<string> = []

  process.env.BLOCKFROST_PROJECT_ID = "integration-test-project"
  globalThis.fetch = (async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)
    requests.push(url.href)
    if (url.origin !== "https://cardano-preprod.blockfrost.io") {
      throw new Error(`Builder requested the wrong Blockfrost network: ${url.origin}`)
    }
    if (request.headers.get("project_id") !== "integration-test-project") {
      throw new Error("Blockfrost request omitted the configured project ID")
    }

    if (url.pathname.endsWith("/epochs/latest/parameters")) return Response.json(protocolParameters)
    const parts = url.pathname.split("/")
    const addressIndex = parts.indexOf("addresses")
    if (addressIndex >= 0 && url.pathname.endsWith("/utxos")) {
      const address = decodeURIComponent(parts[addressIndex + 1])
      return Response.json(utxosByAddress.get(address) ?? [])
    }
    throw new Error(`Unexpected Blockfrost request: ${url.href}`)
  }) as typeof fetch

  return {
    requests,
    utxosByAddress,
    restore: () => {
      globalThis.fetch = originalFetch
      if (originalProjectId === undefined) delete process.env.BLOCKFROST_PROJECT_ID
      else process.env.BLOCKFROST_PROJECT_ID = originalProjectId
    },
  }
}

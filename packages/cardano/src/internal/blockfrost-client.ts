import { readFileSync } from "node:fs"

import { Address } from "@evolution-sdk/evolution"

export const SEED_PATH = ".seedphrase"
export const BLOCKFROST_PREPROD_URL = "https://cardano-preprod.blockfrost.io/api/v0"

export type BlockfrostReadiness = {
  configured: boolean
  reachable: boolean
  healthy: boolean
}

export type AddressReadiness = {
  funded: boolean
  utxoCount: number
}

export type TransactionInclusion =
  | { status: "not-indexed" }
  | {
      status: "included"
      block: string
      blockHeight: number
      blockTime: number
    }

export class BlockfrostHttpError extends Error {
  constructor(
    readonly status: number,
    readonly responseText: string,
  ) {
    super(`Blockfrost returned HTTP ${status}${responseText ? `: ${responseText}` : ""}`)
    this.name = "BlockfrostHttpError"
  }
}

export const loadMnemonic = (path = SEED_PATH): string => {
  const fromEnv = process.env.WALLET_MNEMONIC?.trim()
  if (fromEnv) return fromEnv

  return readFileSync(path, "utf8").trim()
}

export const loadBlockfrostProjectId = (): string => {
  const projectId = process.env.BLOCKFROST_PROJECT_ID?.trim()
  if (projectId) return projectId

  throw new Error("Set BLOCKFROST_PROJECT_ID")
}

export const getBlockfrostReadiness = async (
  fetchImpl: typeof fetch = fetch,
): Promise<BlockfrostReadiness> => {
  const projectId = process.env.BLOCKFROST_PROJECT_ID?.trim()
  if (!projectId) return { configured: false, reachable: false, healthy: false }

  try {
    const response = await blockfrostFetch("/health", projectId, fetchImpl)
    if (!response.ok) return { configured: true, reachable: true, healthy: false }

    const payload = await response.json() as { is_healthy?: unknown }
    return {
      configured: true,
      reachable: true,
      healthy: payload.is_healthy === true,
    }
  } catch {
    return { configured: true, reachable: false, healthy: false }
  }
}

export const getAddressReadiness = async (
  address: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AddressReadiness> => {
  const response = await blockfrostFetch(
    `/addresses/${encodeURIComponent(address)}/utxos?count=100`,
    loadBlockfrostProjectId(),
    fetchImpl,
  )

  if (response.status === 404) return { funded: false, utxoCount: 0 }
  await requireOk(response)

  const utxos = await response.json()
  if (!Array.isArray(utxos)) throw new Error("Unexpected Blockfrost address response")
  return { funded: utxos.length > 0, utxoCount: utxos.length }
}

export const getTransactionInclusion = async (
  txHash: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TransactionInclusion> => {
  const response = await blockfrostFetch(
    `/txs/${encodeURIComponent(txHash)}`,
    loadBlockfrostProjectId(),
    fetchImpl,
  )

  if (response.status === 404) return { status: "not-indexed" }
  await requireOk(response)

  const payload = await response.json() as {
    block?: unknown
    block_height?: unknown
    block_time?: unknown
  }
  if (
    typeof payload.block !== "string" ||
    typeof payload.block_height !== "number" ||
    typeof payload.block_time !== "number"
  ) {
    throw new Error("Unexpected Blockfrost transaction response")
  }

  return {
    status: "included",
    block: payload.block,
    blockHeight: payload.block_height,
    blockTime: payload.block_time,
  }
}

export const deriveAddressFromSeed = (mnemonic = loadMnemonic()): Address.Address =>
  Address.fromSeed(mnemonic, { accountIndex: 0, networkId: 0 })

const blockfrostFetch = (
  path: string,
  projectId: string,
  fetchImpl: typeof fetch,
): Promise<Response> => fetchImpl(`${BLOCKFROST_PREPROD_URL}${path}`, {
  headers: { project_id: projectId },
})

const requireOk = async (response: Response): Promise<void> => {
  if (response.ok) return
  throw new BlockfrostHttpError(response.status, await response.text())
}

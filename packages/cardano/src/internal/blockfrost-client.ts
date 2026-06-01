import { readFileSync } from "node:fs"

import { Address } from "@evolution-sdk/evolution"

export const SEED_PATH = ".seedphrase"
export const BLOCKFROST_PREPROD_URL = "https://cardano-preprod.blockfrost.io/api/v0"
export const loadMnemonic = (path = SEED_PATH): string => {
  const fromEnv = process.env.WALLET_MNEMONIC?.trim()
  if (fromEnv) return fromEnv

  return readFileSync(path, "utf8").trim()
}

export const loadBlockfrostProjectId = (): string => {
  const projectId = process.env.BLOCKFROST_PROJECT_ID
  if (projectId) return projectId

  throw new Error("Set BLOCKFROST_PROJECT_ID")
}

export const deriveAddressFromSeed = (mnemonic = loadMnemonic()): Address.Address =>
  Address.fromSeed(mnemonic, { accountIndex: 0, networkId: 0 })

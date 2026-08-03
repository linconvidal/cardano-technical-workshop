import { Address, Client, preprod, TransactionWitnessSet } from "@evolution-sdk/evolution"

import type { Cip30WalletApi } from "./global.js"

export type BrowserWalletClient = {
  address(): Promise<Address.Address>
  signTx(txCbor: string): Promise<TransactionWitnessSet.TransactionWitnessSet>
}

export type WalletSession = {
  providerKey: string
  providerName: string
  api: Cip30WalletApi
  client: BrowserWalletClient
  address: string
  networkId: number
}

export type DiscoveredWallet = {
  key: string
  name: string
  icon?: string
}

export const discoverWallets = (): Array<DiscoveredWallet> => {
  if (!window.cardano) return []

  return Object.entries(window.cardano)
    .filter(([, provider]) => typeof provider?.enable === "function")
    .map(([key, provider]) => ({
      key,
      name: provider.name?.trim() || titleCase(key),
      icon: provider.icon,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

export const connectWallet = async (providerKey: string): Promise<WalletSession> => {
  const provider = window.cardano?.[providerKey]
  if (!provider) throw new Error(`Wallet ${providerKey} não encontrada no navegador`)

  const api = await provider.enable()
  const networkId = await api.getNetworkId()
  if (networkId !== 0) {
    throw new Error("A wallet está na mainnet. Selecione Cardano Preprod na extensão e conecte novamente.")
  }

  const client = Client.make(preprod).withCip30(api)
  const address = Address.toBech32(await client.address())

  return {
    providerKey,
    providerName: provider.name?.trim() || titleCase(providerKey),
    api,
    client,
    address,
    networkId,
  }
}

export const signWithWallet = async (session: WalletSession, unsignedTxCbor: string): Promise<string> => {
  const witnessSet = await session.client.signTx(unsignedTxCbor.trim())
  return TransactionWitnessSet.toCBORHex(witnessSet)
}

const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1)

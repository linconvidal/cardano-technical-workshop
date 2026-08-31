import { preprod } from "@evolution-sdk/evolution"

export type WorkshopNetworkConfig = {
  name: "preprod"
  networkId: 0
  evolutionNetwork: typeof preprod
  slotConfigName: "Preprod"
  blockfrostBaseUrl: string
  explorerTransactionBaseUrl: string
}

export type PublicWorkshopNetworkConfig = Pick<
  WorkshopNetworkConfig,
  "name" | "networkId" | "explorerTransactionBaseUrl"
>

const PREPROD_CONFIG: WorkshopNetworkConfig = Object.freeze({
  name: "preprod",
  networkId: 0,
  evolutionNetwork: preprod,
  slotConfigName: "Preprod",
  blockfrostBaseUrl: "https://cardano-preprod.blockfrost.io/api/v0",
  explorerTransactionBaseUrl: "https://preprod.cardanoscan.io/transaction/",
})

const configuredNetworkFromEnvironment = (): string | undefined =>
  typeof process === "undefined" ? undefined : process.env.CARDANO_NETWORK

export const resolveWorkshopNetworkConfig = (
  configuredNetwork = configuredNetworkFromEnvironment(),
): WorkshopNetworkConfig => {
  const network = configuredNetwork?.trim() || "preprod"
  if (network !== "preprod") {
    throw new Error(`Unsupported CARDANO_NETWORK: ${network}. This workshop is restricted to preprod.`)
  }
  return PREPROD_CONFIG
}

export const WORKSHOP_NETWORK_CONFIG = resolveWorkshopNetworkConfig()

export const PUBLIC_WORKSHOP_NETWORK_CONFIG: PublicWorkshopNetworkConfig = Object.freeze({
  name: WORKSHOP_NETWORK_CONFIG.name,
  networkId: WORKSHOP_NETWORK_CONFIG.networkId,
  explorerTransactionBaseUrl: WORKSHOP_NETWORK_CONFIG.explorerTransactionBaseUrl,
})

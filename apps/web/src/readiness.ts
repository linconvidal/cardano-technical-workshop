import { PUBLIC_WORKSHOP_NETWORK_CONFIG } from "../../../packages/cardano/src/internal/network-config.js"
import { workshop } from "./workshop.js"

export type RuntimeNetworkConfig = {
  name: string
  networkId: number
  explorerTransactionBaseUrl: string
}

export type ReadinessResponse = {
  ok: boolean
  network: RuntimeNetworkConfig
  provider: {
    configured: boolean
    reachable: boolean
    healthy: boolean
  }
  wallet?: {
    funded: boolean
    utxoCount: number
  }
}

export type WorkbenchReadiness = {
  response?: ReadinessResponse
  checking: boolean
  error?: string
  walletConnected: boolean
  walletAddress?: string
}

export const initialReadiness = (): WorkbenchReadiness => ({
  checking: true,
  walletConnected: false,
})

export const checkReadiness = workshop.readiness

// Preprod remains configured when a provider check fails; availability is checked separately.
export const getWorkbenchNetwork = (state: WorkbenchReadiness): RuntimeNetworkConfig =>
  state.response?.network ?? PUBLIC_WORKSHOP_NETWORK_CONFIG

export const canBuildTransactions = (state: WorkbenchReadiness): boolean => Boolean(
  !state.checking &&
  state.walletConnected &&
  state.response?.ok &&
  state.response.wallet?.funded,
)

export const transactionExplorerUrl = (
  network: RuntimeNetworkConfig | undefined,
  txHash: string,
): string | undefined => {
  const baseUrl = network?.explorerTransactionBaseUrl.trim()
  const hash = txHash.trim()
  if (!baseUrl || !hash) return undefined
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  return new URL(encodeURIComponent(hash), normalizedBase).href
}

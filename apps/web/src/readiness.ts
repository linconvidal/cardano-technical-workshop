import { getJson } from "./http.js"

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
  note: string
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

export const checkReadiness = async (walletAddress?: string): Promise<ReadinessResponse> => {
  const query = walletAddress ? `?address=${encodeURIComponent(walletAddress)}` : ""
  return getJson<ReadinessResponse>(`/api/readiness${query}`)
}

export const canBuildTransactions = (state: WorkbenchReadiness): boolean => Boolean(
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

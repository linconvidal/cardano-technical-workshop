import assert from "node:assert/strict"
import test from "node:test"

import { PUBLIC_WORKSHOP_NETWORK_CONFIG } from "../../../packages/cardano/src/internal/network-config.js"
import {
  canBuildTransactions,
  getWorkbenchNetwork,
  initialReadiness,
  transactionExplorerUrl,
  type RuntimeNetworkConfig,
  type WorkbenchReadiness,
} from "./readiness.js"

const runtimeNetwork = (explorerTransactionBaseUrl: string): RuntimeNetworkConfig => ({
  name: "preprod",
  networkId: 0,
  explorerTransactionBaseUrl,
})

test("provider failures preserve the configured network without enabling transaction builds", () => {
  const initial = initialReadiness()
  const failed: WorkbenchReadiness = {
    checking: false,
    error: "Blockfrost returned HTTP 429",
    walletConnected: true,
    walletAddress: "addr_test",
  }

  for (const state of [initial, failed]) {
    assert.equal(getWorkbenchNetwork(state), PUBLIC_WORKSHOP_NETWORK_CONFIG)
    assert.equal(canBuildTransactions(state), false)
    assert.equal(
      transactionExplorerUrl(getWorkbenchNetwork(state), "a".repeat(64)),
      `https://preprod.cardanoscan.io/transaction/${"a".repeat(64)}`,
    )
  }
})

test("readiness retains an explicit network response while a new health check is pending", () => {
  const network = runtimeNetwork("https://explorer.example/tx/")
  const ready: WorkbenchReadiness = {
    checking: false,
    walletConnected: true,
    response: {
      ok: true,
      network,
      provider: { configured: true, reachable: true, healthy: true },
      wallet: { funded: true, utxoCount: 1 },
    },
  }
  assert.equal(getWorkbenchNetwork(ready), network)
  assert.equal(canBuildTransactions(ready), true)
  assert.equal(getWorkbenchNetwork({ ...ready, checking: true }), network)
  assert.equal(canBuildTransactions({ ...ready, checking: true }), false)
})

test("transaction explorer links use the trusted runtime network projection", () => {
  assert.equal(
    transactionExplorerUrl(runtimeNetwork("https://explorer.example/tx"), "abc123"),
    "https://explorer.example/tx/abc123",
  )
  assert.equal(transactionExplorerUrl(undefined, "abc123"), undefined)
  assert.equal(transactionExplorerUrl(runtimeNetwork("https://explorer.example/tx/"), ""), undefined)
})

import assert from "node:assert/strict"
import test from "node:test"

import { transactionExplorerUrl, type RuntimeNetworkConfig } from "./readiness.js"

const runtimeNetwork = (explorerTransactionBaseUrl: string): RuntimeNetworkConfig => ({
  name: "preprod",
  networkId: 0,
  explorerTransactionBaseUrl,
})

test("transaction explorer links use the trusted runtime network projection", () => {
  assert.equal(
    transactionExplorerUrl(runtimeNetwork("https://explorer.example/tx"), "abc123"),
    "https://explorer.example/tx/abc123",
  )
  assert.equal(transactionExplorerUrl(undefined, "abc123"), undefined)
  assert.equal(transactionExplorerUrl(runtimeNetwork("https://explorer.example/tx/"), ""), undefined)
})

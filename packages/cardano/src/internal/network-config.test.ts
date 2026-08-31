import assert from "node:assert/strict"
import test from "node:test"

import { preprod } from "@evolution-sdk/evolution"

import { resolveWorkshopNetworkConfig } from "./network-config.js"

test("workshop network configuration resolves the explicit Preprod contract", () => {
  for (const configuredNetwork of [undefined, "", "preprod"] as const) {
    const config = resolveWorkshopNetworkConfig(configuredNetwork)
    assert.equal(config.name, "preprod")
    assert.equal(config.networkId, 0)
    assert.equal(config.evolutionNetwork, preprod)
    assert.equal(config.slotConfigName, "Preprod")
    assert.equal(config.blockfrostBaseUrl, "https://cardano-preprod.blockfrost.io/api/v0")
    assert.equal(config.explorerTransactionBaseUrl, "https://preprod.cardanoscan.io/transaction/")
  }
})

test("workshop network configuration rejects unsupported or ambiguous networks", () => {
  for (const configuredNetwork of ["mainnet", "preview", "Preprod", "pre-prod", "custom"]) {
    assert.throws(
      () => resolveWorkshopNetworkConfig(configuredNetwork),
      new RegExp(`Unsupported CARDANO_NETWORK: ${configuredNetwork}`),
    )
  }
})

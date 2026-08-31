import assert from "node:assert/strict"
import test from "node:test"

import { Address, KeyHash } from "@evolution-sdk/evolution"

import type { Cip30WalletApi } from "./global.js"
import { MessageError } from "./flow-errors.js"
import { connectWallet, discoverWallets } from "./wallet.js"

const preprodNetwork = {
  name: "preprod",
  networkId: 0,
  explorerTransactionBaseUrl: "https://preprod.cardanoscan.io/transaction/",
} as const

const walletApi = (networkId: number, address: Address.Address): Cip30WalletApi => ({
  getNetworkId: async () => networkId,
  getUsedAddresses: async () => [Address.toHex(address)],
  getUnusedAddresses: async () => [],
  getRewardAddresses: async () => [],
  getUtxos: async () => [],
  signTx: async () => "a100",
  signData: async () => ({ payload: "", signature: "" }),
  submitTx: async () => "a".repeat(64),
})

const withWindow = async (cardano: NonNullable<Window["cardano"]>, action: () => Promise<void> | void) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { cardano },
    writable: true,
  })
  try {
    await action()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor)
    else delete (globalThis as { window?: Window }).window
  }
}

test("wallet discovery and connection use the selected CIP-30 provider without inferring Preview", async () => {
  const address = new Address.Address({
    networkId: 0,
    paymentCredential: KeyHash.fromHex("1".repeat(56)),
  })
  let enableCalls = 0
  await withWindow({
    zeta: {
      name: "Zeta Wallet",
      enable: async () => {
        enableCalls += 1
        return walletApi(0, address)
      },
    },
    alpha: {
      name: "Alpha Wallet",
      enable: async () => walletApi(0, address),
    },
  }, async () => {
    assert.deepEqual(discoverWallets("en").map(({ key }) => key), ["alpha", "zeta"])

    const session = await connectWallet("zeta", preprodNetwork)
    assert.equal(enableCalls, 1)
    assert.equal(session.providerKey, "zeta")
    assert.equal(session.providerName, "Zeta Wallet")
    assert.equal(session.networkId, 0)
    assert.equal(session.address, Address.toBech32(address))
  })
})

test("wallet connection rejects backend mismatch, missing providers, and mainnet", async () => {
  const address = new Address.Address({
    networkId: 0,
    paymentCredential: KeyHash.fromHex("2".repeat(56)),
  })
  let enableCalls = 0
  await withWindow({
    nami: {
      name: "Nami",
      enable: async () => {
        enableCalls += 1
        return walletApi(1, address)
      },
    },
  }, async () => {
    await assert.rejects(
      connectWallet("nami", { ...preprodNetwork, name: "preview" }),
      (error) => error instanceof MessageError && error.code === "wallet_network_configuration",
    )
    assert.equal(enableCalls, 0)

    await assert.rejects(
      connectWallet("missing", preprodNetwork),
      (error) => error instanceof MessageError && error.code === "wallet_not_found",
    )
    await assert.rejects(
      connectWallet("nami", preprodNetwork),
      (error) => error instanceof MessageError && error.code === "wallet_on_mainnet",
    )
  })
})

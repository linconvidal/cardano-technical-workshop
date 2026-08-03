import assert from "node:assert/strict"
import test from "node:test"

import { Address, KeyHash } from "@evolution-sdk/evolution"

import { ensureMintValidity, ensureWalletIsRequiredSigner } from "./workbench-flows.js"

test("wallet membership is checked before signing a multisig unlock", () => {
  const signerHash = KeyHash.fromHex("1".repeat(56))
  const signerAddress = Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: signerHash }))
  const unrelatedAddress = Address.toBech32(new Address.Address({
    networkId: 0,
    paymentCredential: KeyHash.fromHex("2".repeat(56)),
  }))

  assert.doesNotThrow(() => ensureWalletIsRequiredSigner({ requiredSigners: [KeyHash.toHex(signerHash)] }, signerAddress))
  assert.throws(
    () => ensureWalletIsRequiredSigner({ requiredSigners: [KeyHash.toHex(signerHash)] }, unrelatedAddress),
    /não pertence aos required signers/,
  )
})

test("mint validity requires enough time to sign and submit", () => {
  const now = 1_700_000_000_000
  assert.doesNotThrow(() => ensureMintValidity({ transaction: { ttlUnixMs: String(now + 31_000) } }, now))
  assert.throws(
    () => ensureMintValidity({ transaction: { ttlUnixMs: String(now + 30_000) } }, now),
    /validade da policy.*expirou/i,
  )
  assert.throws(() => ensureMintValidity(undefined, now), /validade da policy/i)
})

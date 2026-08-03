import assert from "node:assert/strict"
import test from "node:test"

import { Address, KeyHash } from "@evolution-sdk/evolution"

import { describeMultisig, twoSignerScript } from "./04-multisig.js"

const address = (paymentByte: string, stakeByte?: string) => Address.toBech32(new Address.Address({
  networkId: 0,
  paymentCredential: KeyHash.fromHex(paymentByte.repeat(56)),
  stakingCredential: stakeByte ? KeyHash.fromHex(stakeByte.repeat(56)) : undefined,
}))

test("2-de-2 rejects addresses that share one payment key", () => {
  assert.throws(
    () => twoSignerScript(address("1", "2"), address("1", "3")),
    /two distinct payment keys/,
  )
})

test("2-de-2 exposes two distinct required signer hashes", () => {
  const details = describeMultisig({
    userAddress: address("4"),
    secondSignerAddress: address("5"),
  })

  assert.equal(details.requiredSigners.length, 2)
  assert.notEqual(details.requiredSigners[0], details.requiredSigners[1])
  assert.match(details.scriptAddress, /^addr_test/)
})

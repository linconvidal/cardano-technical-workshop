import assert from "node:assert/strict"
import test from "node:test"

import { Address, KeyHash, PrivateKey, Transaction, TransactionBody, TransactionWitnessSet } from "@evolution-sdk/evolution"

import { addressFor, blockfrostUtxo, installControlledBlockfrost, lovelace, outputLovelaceAt } from "../../../packages/cardano/src/workshop/workshop-builder-test-fixture.js"

import { app } from "./server.js"

const testAddress = (hexDigit: string): string => Address.toBech32(new Address.Address({
  networkId: 0,
  paymentCredential: KeyHash.fromHex(hexDigit.repeat(56)),
}))

test("API builds with the server credential and preserves an ambiguous provider submission failure", async () => {
  const request = globalThis.fetch
  const controlled = installControlledBlockfrost()
  const userAddress = addressFor("1")
  const recipientAddress = addressFor("2")
  controlled.utxosByAddress.set(userAddress, [blockfrostUtxo(userAddress, "a".repeat(64), [lovelace()])])
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening))
  })
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const baseUrl = `http://127.0.0.1:${address.port}`
  try {
    const response = await request(`${baseUrl}/api/workshop/01-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress, recipientAddress, lovelace: "2000000" }),
    })
    assert.equal(response.status, 200)
    const { txCbor } = await response.json() as { txCbor: string }
    const tx = Transaction.fromCBORHex(txCbor)
    assert.equal(outputLovelaceAt(tx, recipientAddress), 2_000_000n)
    assert.ok(controlled.requests.length > 0)

    // Synthetic witness and intercepted provider: no real transaction leaves this test.
    const key = PrivateKey.fromBytes(new Uint8Array(32).fill(1))
    const witness = new TransactionWitnessSet.VKeyWitness({
      vkey: PrivateKey.toPublicKey(key),
      signature: PrivateKey.sign(key, TransactionBody.toHash(tx.body).hash),
    })
    const signedTxCbor = Transaction.toCBORHex(new Transaction.Transaction({
      ...tx, witnessSet: TransactionWitnessSet.fromVKeyWitnesses([witness]),
    }))
    globalThis.fetch = async () => { throw new Error("connection lost after sending") }
    const submission = await request(`${baseUrl}/api/submit-tx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signedTxCbor }),
    })
    assert.equal(submission.status, 502)
    assert.equal((await submission.json() as { error: { code: string } }).error.code, "workshop_action_failed")
  } finally {
    controlled.restore()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test("Express routes execute through localization, validation, and compatibility aliases", async () => {
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening))
  })
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    const health = await fetch(`${baseUrl}/api/health`, {
      headers: { "Accept-Language": "en" },
    })
    assert.equal(health.status, 200)
    assert.equal(health.headers.get("content-language"), "en")
    assert.match(health.headers.get("vary") ?? "", /Accept-Language/i)
    assert.deepEqual(await health.json(), { ok: true, service: "cardano-technical-workshop" })

    const multisigBodies = await Promise.all([
      "/api/workshop/03-multisig/describe",
      "/api/workshop/04-multisig/describe",
    ].map(async (path) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": "en" },
        body: JSON.stringify({
          userAddress: testAddress("1"),
          secondSignerAddress: testAddress("2"),
        }),
      })
      assert.equal(response.status, 200)
      return response.json()
    }))
    assert.deepEqual(multisigBodies[1], multisigBodies[0])

    for (const path of [
      "/api/workshop/04b-mint-cip25",
      "/api/workshop/04-mint-cip25",
      "/api/workshop/03-mint-cip25",
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept-Language": "en" },
        body: "{}",
      })
      assert.equal(response.status, 400)
      assert.equal(response.headers.get("content-language"), "en")
      const body = await response.json() as { error?: { code?: unknown; field?: unknown } }
      assert.equal(body.error?.code, "invalid_request")
      assert.equal(body.error?.field, "userAddress")
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

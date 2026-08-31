import assert from "node:assert/strict"
import test from "node:test"

import { Address, KeyHash } from "@evolution-sdk/evolution"

import { app } from "./server.js"

const testAddress = (hexDigit: string): string => Address.toBech32(new Address.Address({
  networkId: 0,
  paymentCredential: KeyHash.fromHex(hexDigit.repeat(56)),
}))

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

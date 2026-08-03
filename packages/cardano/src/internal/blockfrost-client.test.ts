import assert from "node:assert/strict"
import test from "node:test"

import {
  BlockfrostHttpError,
  getAddressReadiness,
  getBlockfrostReadiness,
  getTransactionInclusion,
} from "./blockfrost-client.js"

const originalProjectId = process.env.BLOCKFROST_PROJECT_ID

test.afterEach(() => {
  if (originalProjectId === undefined) delete process.env.BLOCKFROST_PROJECT_ID
  else process.env.BLOCKFROST_PROJECT_ID = originalProjectId
})

test("readiness reports missing configuration without calling the network", async () => {
  delete process.env.BLOCKFROST_PROJECT_ID
  let called = false

  const result = await getBlockfrostReadiness(async () => {
    called = true
    return new Response()
  })

  assert.deepEqual(result, { configured: false, reachable: false, healthy: false })
  assert.equal(called, false)
})

test("readiness validates the configured Preprod provider", async () => {
  process.env.BLOCKFROST_PROJECT_ID = "preprod-test"

  const result = await getBlockfrostReadiness(async (_input, init) => {
    assert.deepEqual(init?.headers, { project_id: "preprod-test" })
    return Response.json({ is_healthy: true })
  })

  assert.deepEqual(result, { configured: true, reachable: true, healthy: true })
})

test("address readiness distinguishes unused and funded addresses", async () => {
  process.env.BLOCKFROST_PROJECT_ID = "preprod-test"

  assert.deepEqual(
    await getAddressReadiness("addr_test_unused", async () => new Response("not found", { status: 404 })),
    { funded: false, utxoCount: 0 },
  )
  assert.deepEqual(
    await getAddressReadiness("addr_test_funded", async () => Response.json([{ tx_hash: "abc" }, { tx_hash: "def" }])),
    { funded: true, utxoCount: 2 },
  )
})

test("transaction lookup distinguishes pending and included states", async () => {
  process.env.BLOCKFROST_PROJECT_ID = "preprod-test"

  assert.deepEqual(
    await getTransactionInclusion("a".repeat(64), async () => new Response("not found", { status: 404 })),
    { status: "not-indexed" },
  )
  assert.deepEqual(
    await getTransactionInclusion("b".repeat(64), async () => Response.json({
      block: "block-hash",
      block_height: 123,
      block_time: 1_700_000_000,
    })),
    {
      status: "included",
      block: "block-hash",
      blockHeight: 123,
      blockTime: 1_700_000_000,
    },
  )
})

test("transaction lookup preserves upstream HTTP evidence", async () => {
  process.env.BLOCKFROST_PROJECT_ID = "preprod-test"

  await assert.rejects(
    () => getTransactionInclusion("c".repeat(64), async () => new Response("rate limited", { status: 429 })),
    (error: unknown) => error instanceof BlockfrostHttpError && error.status === 429,
  )
})

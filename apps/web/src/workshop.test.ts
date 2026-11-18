import assert from "node:assert/strict"
import test from "node:test"
import { PrivateKey, Transaction, TransactionBody, TransactionWitnessSet } from "@evolution-sdk/evolution"

import { ApiError } from "../../../packages/cardano/src/workshop/api-error.js"
import {
  addressFor, blockfrostUtxo, installControlledBlockfrost, lovelace, outputLovelaceAt, transaction,
} from "../../../packages/cardano/src/workshop/workshop-builder-test-fixture.js"
import { formatMessage } from "../../../packages/localization/src/index.js"
import { canBuildTransactions } from "./readiness.js"
import { toFlowError } from "./flow-errors.js"
import { apiWorkshop, blockfrostStorageKey, browserWorkshop as workshop, getProjectId, setProjectId, workshop as defaultWorkshop } from "./workshop.js"

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const originalFetch = globalThis.fetch
const values = new Map<string, string>()

test.beforeEach(() => {
  values.clear()
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  } })
})
test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage)
  else Reflect.deleteProperty(globalThis, "localStorage")
})

test("the default frontend uses the API without reading or sending a browser credential", async () => {
  assert.equal(defaultWorkshop, apiWorkshop)
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("API mode must not access browser credentials") } })
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/workshop/01-payment")
    assert.equal(init?.method, "POST")
    assert.equal(new Headers(init?.headers).get("project_id"), null)
    assert.equal(new Headers(init?.headers).get("Accept-Language"), "pt-BR")
    assert.deepEqual(JSON.parse(String(init?.body)), { userAddress: "user", recipientAddress: "recipient", lovelace: "2000000" })
    return Response.json({ txCbor: "from-api", details: {} })
  }
  assert.deepEqual(await defaultWorkshop.payment({ userAddress: "user", recipientAddress: "recipient", lovelace: "2000000" }), { txCbor: "from-api", details: {} })
})

test("configuration trims, replaces and removes only the provider key", () => {
  values.set("cardano-technical-workshop.locale.v1", "en")
  setProjectId("  preprod-first  ")
  assert.equal(getProjectId(), "preprod-first")
  setProjectId("preprod-second")
  assert.equal(values.get(blockfrostStorageKey), "preprod-second")
  setProjectId("  ")
  assert.equal(getProjectId(), "")
  assert.deepEqual([...values], [["cardano-technical-workshop.locale.v1", "en"]])
})

test("blocked storage reads fail closed and writes report failure", () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked") } })
  assert.equal(getProjectId(), "")
  assert.throws(() => setProjectId("preprod-test"), /blocked/)
})

test("missing browser configuration never falls back to a server credential or calls the network", async () => {
  globalThis.fetch = async () => { throw new Error("unexpected network request") }
  const response = await workshop.readiness()
  assert.equal(response.ok, false)
  assert.deepEqual(response.provider, { configured: false, reachable: false, healthy: false })
  assert.equal(response.network.name, "preprod")
  assert.equal(canBuildTransactions({ response: { ...response, ok: true, wallet: { funded: true, utxoCount: 1 } }, checking: true, walletConnected: true }), false)
})

test("readiness uses only the configured key and fixed Preprod origin", async () => {
  setProjectId("preprod-browser")
  globalThis.fetch = async (input, init) => {
    assert.ok(String(input).startsWith("https://cardano-preprod.blockfrost.io/api/v0/"))
    assert.equal(new Headers(init?.headers).get("project_id"), "preprod-browser")
    return Response.json(String(input).endsWith("/health") ? { is_healthy: true } : [{}])
  }
  const response = await workshop.readiness(addressFor("1"))
  assert.equal(response.ok, true)
  assert.deepEqual(response.wallet, { funded: true, utxoCount: 1 })
})

test("validation stays structured and bilingual without an HTTP boundary", async () => {
  await assert.rejects(() => workshop.payment({}), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 400)
    assert.equal(error.problem.field, "userAddress")
    assert.match(formatMessage(error.problem.message, "pt-BR"), /obrigatório/)
    assert.match(formatMessage(error.problem.message, "en"), /Required/)
    return true
  })
})

test("provider failures redact the configured key before reaching UI diagnostics", async () => {
  setProjectId("preprod-private-test-key")
  globalThis.fetch = async () => new Response("Unauthorized preprod-private-test-key", { status: 401 })
  await assert.rejects(() => workshop.checkStatus("a".repeat(64)), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.problem.code, "provider_authentication_failed")
    assert.ok(!JSON.stringify(error.problem).includes("preprod-private-test-key"))
    return true
  })
})

test("browser service constructs locally and preserves ambiguous submission semantics", async () => {
  const controlled = installControlledBlockfrost()
  setProjectId("integration-test-project")
  // A hidden dependency on the Node environment would send the wrong credential.
  process.env.BLOCKFROST_PROJECT_ID = "must-not-use-server-key"
  const userAddress = addressFor("1")
  const recipientAddress = addressFor("2")
  controlled.utxosByAddress.set(userAddress, [blockfrostUtxo(userAddress, "a".repeat(64), [lovelace()])])
  try {
    const result = await workshop.payment({ userAddress, recipientAddress, lovelace: "2000000" })
    const tx = transaction(result.txCbor)
    assert.equal(outputLovelaceAt(tx, recipientAddress), 2_000_000n)
    assert.ok(controlled.requests.every((url) => url.startsWith("https://cardano-preprod.blockfrost.io/")))
    const key = PrivateKey.fromBytes(new Uint8Array(32).fill(1))
    const witness = new TransactionWitnessSet.VKeyWitness({
      vkey: PrivateKey.toPublicKey(key), signature: PrivateKey.sign(key, TransactionBody.toHash(tx.body).hash),
    })
    const signed = Transaction.toCBORHex(new Transaction.Transaction({
      ...tx, witnessSet: TransactionWitnessSet.fromVKeyWitnesses([witness]),
    }))
    let calls = 0
    globalThis.fetch = async () => { calls += 1; throw new Error("connection lost after sending") }
    await assert.rejects(() => workshop.submit(signed), (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 0)
      assert.equal(toFlowError("submit", error).message.key, "flow.error.submissionUnknown.message")
      return true
    })
    assert.ok(calls > 0)
    calls = 0
    await assert.rejects(() => workshop.submit("not-cbor"), (error: unknown) => error instanceof ApiError && error.status === 400)
    assert.equal(calls, 0)
  } finally {
    controlled.restore()
  }
})

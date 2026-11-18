import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../../../packages/cardano/src/workshop/api-error.js"
import { formatMessage } from "../../../packages/localization/src/index.js"
import { getJson, postJson } from "./http.js"

const originalFetch = globalThis.fetch
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")

test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument)
  else Reflect.deleteProperty(globalThis, "document")
})

const setLocale = (lang: string) => Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { documentElement: { lang } },
})

test("HTTP requests use the applied locale and never send a Blockfrost credential", async () => {
  setLocale("en")
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/example")
    assert.equal(new Headers(init?.headers).get("Accept-Language"), "en")
    assert.equal(new Headers(init?.headers).get("project_id"), null)
    if (init?.method === "POST") assert.equal(init.body, JSON.stringify({ value: 1 }))
    return Response.json({ ok: true })
  }
  assert.deepEqual(await getJson("/api/example"), { ok: true })
  assert.deepEqual(await postJson("/api/example", { value: 1 }), { ok: true })
})

test("HTTP problems preserve references, validation fields, and bilingual guidance", async () => {
  globalThis.fetch = async () => Response.json({ error: {
    code: "invalid_request", message: "Required field", messageKey: "api.validation.required",
    messageValues: { field: "lovelace" }, retryable: false, field: "lovelace",
    guidanceKey: "api.validation.positiveInteger", guidanceValues: { field: "lovelace" },
    technicalDetail: "raw detail",
  } }, { status: 400 })
  await assert.rejects(() => getJson("/api/example"), (error: unknown) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 400)
    assert.equal(error.problem.field, "lovelace")
    assert.equal(error.problem.retryable, false)
    assert.equal(error.problem.technicalDetail, "raw detail")
    assert.match(formatMessage(error.problem.message, "pt-BR"), /obrigatório/)
    assert.match(formatMessage(error.problem.message, "en"), /Required/)
    assert.equal(error.problem.guidance?.key, "api.validation.positiveInteger")
    return true
  })
})

test("connection loss and unreadable success responses retain unknown submission status", async () => {
  for (const fetchImpl of [
    async () => { throw new Error("connection lost") },
    async () => new Response("not JSON", { status: 200 }),
    async () => {
      const response = new Response()
      response.text = async () => { throw new Error("body lost") }
      return response
    },
  ]) {
    globalThis.fetch = fetchImpl
    await assert.rejects(() => postJson("/api/submit-tx", {}), (error: unknown) =>
      error instanceof ApiError && error.status === 0 && error.problem.retryable)
  }
})

test("non-JSON failures retain HTTP evidence and unknown locales fall back to Portuguese", async () => {
  setLocale("fr")
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("Accept-Language"), "pt-BR")
    return new Response("upstream unavailable", { status: 502 })
  }
  await assert.rejects(() => getJson("/api/readiness"), (error: unknown) =>
    error instanceof ApiError && error.status === 502 && error.problem.technicalDetail === "upstream unavailable")
})

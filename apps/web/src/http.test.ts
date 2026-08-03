import assert from "node:assert/strict"
import test from "node:test"

import { getJson, HttpError, postJson } from "./http.js"

const originalFetch = globalThis.fetch

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

test("returns JSON for successful GET and POST requests", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/example")
    if (init?.method === "POST") assert.equal(init.body, JSON.stringify({ value: 1 }))
    return Response.json({ ok: true })
  }

  assert.deepEqual(await getJson("/api/example"), { ok: true })
  assert.deepEqual(await postJson("/api/example", { value: 1 }), { ok: true })
})

test("preserves structured API problems", async () => {
  globalThis.fetch = async () => Response.json({
    error: {
      code: "invalid_request",
      message: "Campo inválido",
      retryable: false,
      field: "lovelace",
      guidance: "Use um inteiro positivo.",
      technicalDetail: "raw detail",
    },
  }, { status: 400 })

  await assert.rejects(
    () => getJson("/api/example"),
    (error: unknown) => error instanceof HttpError &&
      error.status === 400 &&
      error.problem.code === "invalid_request" &&
      error.problem.field === "lovelace",
  )
})

test("turns network failure into an actionable backend error", async () => {
  globalThis.fetch = async () => { throw new Error("connection refused") }

  await assert.rejects(
    () => getJson("/api/example"),
    (error: unknown) => error instanceof HttpError &&
      error.problem.code === "backend_unreachable" &&
      error.problem.retryable,
  )
})

test("rejects successful responses without JSON", async () => {
  globalThis.fetch = async () => new Response("<html>not json</html>")

  await assert.rejects(
    () => getJson("/api/example"),
    (error: unknown) => error instanceof HttpError && error.problem.code === "invalid_backend_response",
  )
})

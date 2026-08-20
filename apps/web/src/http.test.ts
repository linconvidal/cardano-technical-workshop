import assert from "node:assert/strict"
import test from "node:test"

import { getJson, HttpError, postJson } from "./http.js"

const originalFetch = globalThis.fetch
const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document")

test.afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalDocumentDescriptor) Object.defineProperty(globalThis, "document", originalDocumentDescriptor)
  else Reflect.deleteProperty(globalThis, "document")
})

test("returns JSON for successful GET and POST requests", async () => {
  setAppliedLocale("pt-BR")
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "/api/example")
    assert.equal(new Headers(init?.headers).get("Accept-Language"), "pt-BR")
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
      messageKey: "api.validation.required",
      messageValues: { field: "lovelace" },
      retryable: false,
      field: "lovelace",
      guidance: "Use um inteiro positivo.",
      guidanceKey: "api.validation.positiveInteger",
      guidanceValues: { field: "lovelace" },
      technicalDetail: "raw detail",
    },
  }, { status: 400 })

  await assert.rejects(
    () => getJson("/api/example"),
    (error: unknown) => error instanceof HttpError &&
      error.status === 400 &&
      error.problem.code === "invalid_request" &&
      error.problem.field === "lovelace" &&
      error.problem.messageRef?.key === "api.validation.required" &&
      error.problem.messageRef.values.field === "lovelace" &&
      error.problem.guidanceRef?.key === "api.validation.positiveInteger" &&
      error.problem.technicalDetail === "raw detail",
  )
})

test("sends the locale applied by the locale controller and falls back to Portuguese", async () => {
  setAppliedLocale("en")
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("Accept-Language"), "en")
    return Response.json({ ok: true })
  }
  await getJson("/api/example")

  setAppliedLocale("fr-FR")
  globalThis.fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("Accept-Language"), "pt-BR")
    return Response.json({ ok: true })
  }
  await getJson("/api/example")
})

test("localizes browser transport errors in English with stable references", async () => {
  setAppliedLocale("en")
  globalThis.fetch = async () => { throw new Error("connection refused") }

  await assert.rejects(
    () => getJson("/api/example"),
    (error: unknown) => error instanceof HttpError &&
      error.problem.message === "The Workbench could not reach the backend" &&
      error.problem.messageRef?.key === "http.backendUnreachable.message" &&
      error.problem.guidanceRef?.key === "http.backendUnreachable.guidance" &&
      error.problem.technicalDetail === "connection refused",
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

const setAppliedLocale = (lang: string) => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { lang } },
  })
}

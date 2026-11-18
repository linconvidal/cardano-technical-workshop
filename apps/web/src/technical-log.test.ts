import assert from "node:assert/strict"
import test from "node:test"

import { ApiError } from "../../../packages/cardano/src/workshop/api-error.js"
import { messageRef } from "../../../packages/localization/src/index.js"
import { MessageError } from "./flow-errors.js"
import { errorLogDetail, formatLogDetail } from "./technical-log.js"

test("API log details follow the selected language, including later language changes", () => {
  const reference = messageRef("http.invalidBackendResponse.message")
  const error = new ApiError(0, { code: "invalid_backend_response", message: reference, retryable: true })
  const detail = errorLogDetail(error)

  assert.equal(detail, reference)
  assert.equal(formatLogDetail(detail, "en"), "The API responded without valid JSON")
  assert.equal(formatLogDetail(detail, "pt-BR"), "A API respondeu sem JSON válido")
  assert.equal(formatLogDetail(detail, "en"), "The API responded without valid JSON")
})

test("localized application errors keep their message references in the log", () => {
  const reference = messageRef("wallet.error.mainnet")
  const detail = errorLogDetail(new MessageError("wallet_on_mainnet", reference))
  assert.equal(detail, reference)
  assert.match(formatLogDetail(detail, "en"), /wallet is on mainnet/)
  assert.match(formatLogDetail(detail, "pt-BR"), /wallet está na mainnet/)
})

test("raw technical diagnostics remain unchanged across languages", () => {
  const raw = "upstream diagnostic: request_id=123"
  const detail = errorLogDetail(new MessageError("provider_error", messageRef("api.blockfrostError.message"), undefined, true, raw))
  for (const value of [detail, errorLogDetail(new Error(raw)), errorLogDetail(raw)]) {
    assert.equal(formatLogDetail(value, "en"), raw)
    assert.equal(formatLogDetail(value, "pt-BR"), raw)
  }
  assert.equal(formatLogDetail(undefined, "en"), "")
})

import assert from "node:assert/strict"
import test from "node:test"

import {
  englishCatalog,
  formatDateTime,
  formatMessage,
  formatScaledBigInt,
  interpolateText,
  messageRef,
  portugueseCatalog,
  resolveLocale,
} from "./index.js"

test("Portuguese and English catalogs have identical semantic keys", () => {
  assert.deepEqual(Object.keys(englishCatalog).sort(), Object.keys(portugueseCatalog).sort())
})

test("text interpolation is literal and preserves missing placeholders", () => {
  assert.equal(
    interpolateText("Hello, {name}. {missing}", { name: "<img src=x onerror=alert(1)>" }),
    "Hello, <img src=x onerror=alert(1)>. {missing}",
  )
  assert.equal(
    formatMessage(messageRef("flow.notice.witnessesPartial", { supplied: 1, required: 2 }), "en"),
    "1 of 2 signatures available.",
  )
})

test("locale resolution supports only Portuguese and English with Portuguese fallback", () => {
  assert.equal(resolveLocale("pt-PT"), "pt-BR")
  assert.equal(resolveLocale("en-US"), "en")
  assert.equal(resolveLocale(["fr-FR", "en-GB"]), "en")
  assert.equal(resolveLocale("es"), "pt-BR")
  assert.equal(resolveLocale(undefined), "pt-BR")
})

test("date and scaled bigint formatting follow the resolved locale", () => {
  const date = new Date("2024-01-02T15:04:00.000Z")
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }
  assert.equal(
    formatDateTime(date, "pt-BR", options),
    new Intl.DateTimeFormat("pt-BR", options).format(date),
  )
  assert.equal(
    formatDateTime(date, "en", options),
    new Intl.DateTimeFormat("en", options).format(date),
  )
  assert.equal(formatScaledBigInt(1_234_567_890n, 6, "pt-BR"), "1.234,56789")
  assert.equal(formatScaledBigInt(1_234_567_890n, 1_000_000n, "en"), "1,234.56789")
  assert.equal(
    formatScaledBigInt(1_999_999n, 6, "en", { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
    "2.00",
  )
})

import assert from "node:assert/strict"
import test from "node:test"

import { LOCALE_STORAGE_KEY, LocaleController } from "./locale-controller.js"

const memoryStorage = (initial?: string): Storage => {
  const values = new Map<string, string>()
  if (initial) values.set(LOCALE_STORAGE_KEY, initial)
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

test("Portuguese is the default when no preference is stored", () => {
  const controller = new LocaleController({ storage: memoryStorage() })

  assert.equal(controller.locale, "pt-BR")
})

test("a persisted locale is restored and explicit changes notify subscribers", () => {
  const storage = memoryStorage("en")
  const controller = new LocaleController({ storage })
  const notifications: Array<string> = []
  controller.subscribe((locale, previous) => notifications.push(`${previous}:${locale}`))

  assert.equal(controller.locale, "en")
  controller.setLocale("pt-BR")

  assert.equal(storage.getItem(LOCALE_STORAGE_KEY), "pt-BR")
  assert.deepEqual(notifications, ["en:pt-BR"])
})

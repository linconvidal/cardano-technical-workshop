import {
  catalogs,
  defaultLocale,
  portugueseCatalog,
  resolveLocale,
  type Locale,
  type MessageKey,
} from "./catalog.js"

type MessageValue = string | number | boolean
export type MessageValues = Readonly<Record<string, MessageValue>>

export type MessageRef<K extends MessageKey = MessageKey> = {
  key: K
  values: MessageValues
}

export const messageRef = <K extends MessageKey>(
  key: K,
  values: MessageValues = {},
): MessageRef<K> => ({ key, values })

export const formatMessage = (
  reference: MessageRef,
  requestedLocale: Locale | string = defaultLocale,
): string => {
  const locale = resolveLocale(requestedLocale)
  const template = catalogs[locale][reference.key] ?? portugueseCatalog[reference.key] ?? reference.key
  return interpolateText(template, reference.values)
}

export const interpolateText = (template: string, values: MessageValues = {}): string =>
  template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder)

export const isMessageRef = (value: unknown): value is MessageRef => {
  if (!isRecord(value) || typeof value.key !== "string" || !(value.key in portugueseCatalog)) return false
  if (!isRecord(value.values)) return false
  return Object.values(value.values).every((entry) =>
    typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

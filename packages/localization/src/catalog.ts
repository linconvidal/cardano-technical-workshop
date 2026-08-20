import { englishApiMessages, portugueseApiMessages } from "./catalogs/api.js"
import { englishCoreMessages, portugueseCoreMessages } from "./catalogs/core.js"
import { englishFlowMessages, portugueseFlowMessages } from "./catalogs/flow.js"
import { englishStaticMessages, portugueseStaticMessages } from "./catalogs/static.js"

export const supportedLocales = ["pt-BR", "en"] as const
export type Locale = typeof supportedLocales[number]
export const defaultLocale: Locale = "pt-BR"

export const portugueseCatalog = {
  ...portugueseCoreMessages,
  ...portugueseStaticMessages,
  ...portugueseFlowMessages,
  ...portugueseApiMessages,
} as const

export type MessageKey = keyof typeof portugueseCatalog
export type Catalog = Readonly<Record<MessageKey, string>>

export const englishCatalog = {
  ...englishCoreMessages,
  ...englishStaticMessages,
  ...englishFlowMessages,
  ...englishApiMessages,
} as const satisfies Catalog

export const catalogs: Readonly<Record<Locale, Catalog>> = {
  "pt-BR": portugueseCatalog,
  en: englishCatalog,
}

export const resolveLocale = (
  requested?: string | ReadonlyArray<string> | null,
): Locale => {
  const candidates = typeof requested === "string" ? [requested] : requested ?? []
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase()
    if (normalized === "en" || normalized.startsWith("en-")) return "en"
    if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-BR"
  }
  return defaultLocale
}

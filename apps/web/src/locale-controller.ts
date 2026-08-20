import {
  formatMessage,
  isMessageRef,
  messageRef,
  defaultLocale,
  resolveLocale,
  type Locale,
  type MessageRef,
} from "../../../packages/localization/src/index.js"

export const LOCALE_STORAGE_KEY = "cardano-technical-workshop.locale.v1"

type LocaleSubscriber = (locale: Locale, previousLocale: Locale) => void

type LocaleControllerOptions = {
  document?: Document
  storage?: Storage
  navigatorLanguages?: ReadonlyArray<string>
}

export class LocaleController {
  private readonly document?: Document
  private readonly storage?: Storage
  private readonly subscribers = new Set<LocaleSubscriber>()
  private currentLocale: Locale

  constructor(options: LocaleControllerOptions = {}) {
    this.document = options.document ?? globalThis.document
    this.storage = options.storage ?? storageFromWindow()
    const stored = readStoredLocale(this.storage)
    this.currentLocale = stored ? resolveLocale(stored) : defaultLocale
    this.apply(false)
  }

  get locale(): Locale {
    return this.currentLocale
  }

  setLocale(requested: string): Locale {
    const locale = resolveLocale(requested)
    if (locale === this.currentLocale) return locale

    const previousLocale = this.currentLocale
    this.currentLocale = locale
    writeStoredLocale(this.storage, locale)
    const restoreLiveRegions = suspendLiveRegions(this.document)
    try {
      this.apply(false)
      for (const subscriber of this.subscribers) subscriber(locale, previousLocale)
    } finally {
      queueMicrotask(() => {
        restoreLiveRegions()
        this.announceLanguageChange()
      })
    }
    return locale
  }

  subscribe(subscriber: LocaleSubscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  apply(announce = false) {
    if (!this.document) return
    this.document.documentElement.lang = this.currentLocale
    applyDeclarativeMessages(this.document, this.currentLocale)
    if (announce) this.announceLanguageChange()
  }

  private announceLanguageChange() {
    if (!this.document) return
    const announcer = languageAnnouncer(this.document)
    announcer.textContent = formatMessage(messageRef("language.changed"), this.currentLocale)
  }
}

export const createLocaleSelector = (controller: LocaleController): HTMLSelectElement | undefined => {
  const document = globalThis.document
  const existing = document?.querySelector<HTMLSelectElement>("#languageSelector")
  if (existing) {
    existing.value = controller.locale
    existing.addEventListener("change", () => controller.setLocale(existing.value))
    controller.apply()
    return existing
  }
  const host = document?.querySelector<HTMLElement>(".hero")
  if (!document || !host) return undefined

  const container = document.createElement("div")
  container.className = "network-badge"
  container.dataset.localeSelector = "true"
  const label = document.createElement("label")
  label.dataset.i18n = "locale.selector.label"
  const select = document.createElement("select")
  const portuguese = new Option("", "pt-BR")
  portuguese.dataset.i18n = "locale.selector.portuguese"
  const english = new Option("", "en")
  english.dataset.i18n = "locale.selector.english"
  select.append(portuguese, english)
  select.value = controller.locale
  select.addEventListener("change", () => controller.setLocale(select.value))
  label.append(select)
  container.append(label)
  host.append(container)
  controller.apply()
  return select
}

export const applyDeclarativeMessages = (document: Document, locale: Locale) => {
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const reference = declarativeReference(element.dataset.i18n, element.dataset.i18nValues)
    if (reference) element.textContent = formatMessage(reference, locale)
  })

  document.querySelectorAll<HTMLElement>("[data-i18n-attr], [data-i18n-attributes]").forEach((element) => {
    const declaration = element.dataset.i18nAttr ?? element.dataset.i18nAttributes ?? ""
    for (const mapping of declaration.split(/[;,]/).map((entry) => entry.trim()).filter(Boolean)) {
      const separator = mapping.indexOf(":")
      const attribute = separator < 0 ? mapping : mapping.slice(0, separator).trim()
      const key = separator < 0 ? element.getAttribute(`data-i18n-${attribute}`) : mapping.slice(separator + 1).trim()
      if (!key || !isTextAttribute(attribute)) continue
      const reference = declarativeReference(key, element.dataset.i18nValues)
      if (reference) element.setAttribute(attribute, formatMessage(reference, locale))
    }
  })
}

const declarativeReference = (key: string | undefined, serializedValues: string | undefined): MessageRef | undefined => {
  if (!key) return undefined
  const candidate = { key, values: parseValues(serializedValues) }
  return isMessageRef(candidate) ? candidate : undefined
}

const parseValues = (serialized: string | undefined): Record<string, string | number | boolean> => {
  if (!serialized) return {}
  try {
    const value: unknown = JSON.parse(serialized)
    if (!isRecord(value)) return {}
    const values: Record<string, string | number | boolean> = {}
    for (const [name, entry] of Object.entries(value)) {
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        values[name] = entry
      }
    }
    return values
  } catch {
    return {}
  }
}

const isTextAttribute = (attribute: string): boolean =>
  attribute === "title" || attribute === "placeholder" || attribute === "alt" || attribute.startsWith("aria-")

const suspendLiveRegions = (document: Document | undefined): (() => void) => {
  if (!document) return () => undefined
  const regions = [...document.querySelectorAll<HTMLElement>("[aria-live]")]
    .filter((element) => !element.hasAttribute("data-i18n-language-announcer"))
    .map((element) => ({ element, value: element.getAttribute("aria-live") ?? "polite" }))
  regions.forEach(({ element }) => element.setAttribute("aria-live", "off"))
  return () => regions.forEach(({ element, value }) => element.setAttribute("aria-live", value))
}

const languageAnnouncer = (document: Document): HTMLElement => {
  const existing = document.querySelector<HTMLElement>("[data-i18n-language-announcer]")
  if (existing) return existing
  const announcer = document.createElement("span")
  announcer.dataset.i18nLanguageAnnouncer = "true"
  announcer.setAttribute("role", "status")
  announcer.setAttribute("aria-live", "polite")
  announcer.setAttribute("aria-atomic", "true")
  Object.assign(announcer.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: "0",
  })
  ;(document.body ?? document.documentElement).append(announcer)
  return announcer
}

const readStoredLocale = (storage: Storage | undefined): string | undefined => {
  try {
    return storage?.getItem(LOCALE_STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

const writeStoredLocale = (storage: Storage | undefined, locale: Locale) => {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // The selected locale still applies when browser storage is unavailable.
  }
}

const storageFromWindow = (): Storage | undefined => {
  try {
    return globalThis.window?.localStorage
  } catch {
    return undefined
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const portugueseCoreMessages = {
  "language.changed": "Idioma alterado para português do Brasil.",
} as const

export const englishCoreMessages = {
  "language.changed": "Language changed to English.",
} as const satisfies Record<keyof typeof portugueseCoreMessages, string>

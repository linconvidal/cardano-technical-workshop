import {
  formatMessage,
  isMessageRef,
  messageRef,
  resolveLocale,
  type Locale,
  type MessageRef,
} from "../../../packages/localization/src/index.js"

export type ApiProblem = {
  code: string
  message: string
  messageRef?: MessageRef
  retryable: boolean
  field?: string
  guidance?: string
  guidanceRef?: MessageRef
  technicalDetail?: string
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ApiProblem,
  ) {
    super(problem.message)
    this.name = "HttpError"
  }
}

export const getJson = async <T>(url: string): Promise<T> => requestJson<T>(url)

export const postJson = async <T>(url: string, body: unknown): Promise<T> => requestJson<T>(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const locale = activeLocale()
  const headers = new Headers(init?.headers)
  headers.set("Accept-Language", locale)

  let response: Response
  try {
    response = await fetch(url, { ...init, headers })
  } catch (error) {
    throw new HttpError(0, localProblem(
      "backend_unreachable",
      messageRef("http.backendUnreachable.message"),
      locale,
      true,
      messageRef("http.backendUnreachable.guidance"),
      error instanceof Error ? error.message : String(error),
    ))
  }

  const responseText = await response.text()
  const payload = parseJsonResponse(responseText)

  if (!response.ok) throw new HttpError(response.status, normalizeProblem(payload, responseText))
  if (payload === undefined) {
    throw new HttpError(response.status, localProblem(
      "invalid_backend_response",
      messageRef("http.invalidBackendResponse.message"),
      locale,
      true,
      messageRef("http.invalidBackendResponse.guidance"),
      responseText,
    ))
  }

  return payload as T
}

const normalizeProblem = (payload: unknown, responseText: string): ApiProblem => {
  if (isRecord(payload) && isRecord(payload.error)) {
    const problem = payload.error
    if (typeof problem.code === "string" && typeof problem.message === "string") {
      return {
        code: problem.code,
        message: problem.message,
        messageRef: transportedMessageRef(problem.messageKey, problem.messageValues),
        retryable: problem.retryable === true,
        field: typeof problem.field === "string" ? problem.field : undefined,
        guidance: typeof problem.guidance === "string" ? problem.guidance : undefined,
        guidanceRef: transportedMessageRef(problem.guidanceKey, problem.guidanceValues),
        technicalDetail: typeof problem.technicalDetail === "string" ? problem.technicalDetail : undefined,
      }
    }
  }

  const locale = activeLocale()
  if (isRecord(payload) && typeof payload.error === "string") {
    const reference = messageRef("http.legacyApiError.message")
    return {
      code: "legacy_api_error",
      message: stripHtml(payload.error),
      messageRef: reference,
      retryable: true,
      technicalDetail: responseText,
    }
  }

  const reference = responseText
    ? messageRef("http.errorWithMessage.message")
    : messageRef("http.errorWithoutContent.message")
  return {
    code: "http_error",
    message: formatMessage(reference, locale),
    messageRef: reference,
    retryable: true,
    technicalDetail: stripHtml(responseText),
  }
}

const localProblem = (
  code: string,
  reference: MessageRef,
  locale: Locale,
  retryable: boolean,
  guidanceRef?: MessageRef,
  technicalDetail?: string,
): ApiProblem => ({
  code,
  message: formatMessage(reference, locale),
  messageRef: reference,
  retryable,
  guidance: guidanceRef ? formatMessage(guidanceRef, locale) : undefined,
  guidanceRef,
  technicalDetail,
})

const transportedMessageRef = (key: unknown, values: unknown): MessageRef | undefined => {
  const candidate = { key, values }
  return isMessageRef(candidate) ? candidate : undefined
}

const activeLocale = (): Locale => {
  const appliedLocale = globalThis.document?.documentElement.lang
  return resolveLocale(appliedLocale || "pt-BR")
}

const parseJsonResponse = (responseText: string): unknown => {
  if (!responseText.trim()) return undefined

  try {
    return JSON.parse(responseText)
  } catch {
    return undefined
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

import { ApiError, type ApiProblem } from "../../../packages/cardano/src/workshop/api-error.js"
import {
  isMessageRef,
  messageRef,
  resolveLocale,
  type MessageRef,
} from "../../../packages/localization/src/index.js"

export const getJson = <T>(url: string): Promise<T> => requestJson<T>(url)

export const postJson = <T>(url: string, body: unknown): Promise<T> => requestJson<T>(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers)
  headers.set("Accept-Language", resolveLocale(globalThis.document?.documentElement.lang))

  let response: Response
  let text: string
  try {
    response = await fetch(url, { ...init, headers })
    text = await response.text()
  } catch (error) {
    throw new ApiError(0, {
      code: "backend_unreachable",
      message: messageRef("http.backendUnreachable.message"),
      guidance: messageRef("http.backendUnreachable.guidance"),
      retryable: true,
      technicalDetail: error instanceof Error ? error.message : String(error),
    })
  }

  let payload: unknown
  try { payload = JSON.parse(text) } catch { /* Report invalid responses below. */ }
  if (!response.ok) throw new ApiError(response.status, normalizeProblem(payload, text))
  if (payload === undefined) {
    // An unreadable success response cannot establish whether a submission was accepted.
    throw new ApiError(0, {
      code: "invalid_backend_response",
      message: messageRef("http.invalidBackendResponse.message"),
      guidance: messageRef("http.invalidBackendResponse.guidance"),
      retryable: true,
      technicalDetail: text,
    })
  }
  return payload as T
}

const normalizeProblem = (payload: unknown, text: string): ApiProblem => {
  if (isRecord(payload) && isRecord(payload.error)) {
    const problem = payload.error
    return {
      code: typeof problem.code === "string" ? problem.code : "backend_error",
      message: transportedReference(problem.messageKey, problem.messageValues)
        ?? messageRef("api.workshopActionFailed.message"),
      guidance: transportedReference(problem.guidanceKey, problem.guidanceValues)
        ?? messageRef("api.workshopActionFailed.guidance"),
      retryable: problem.retryable === true,
      field: typeof problem.field === "string" ? problem.field : undefined,
      technicalDetail: typeof problem.technicalDetail === "string" ? problem.technicalDetail
        : typeof problem.message === "string" ? problem.message : text,
    }
  }
  return {
    code: "backend_error",
    message: messageRef("api.workshopActionFailed.message"),
    guidance: messageRef("api.workshopActionFailed.guidance"),
    retryable: true,
    technicalDetail: text,
  }
}

const transportedReference = (key: unknown, values: unknown): MessageRef | undefined => {
  const candidate = { key, values }
  return isMessageRef(candidate) ? candidate : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

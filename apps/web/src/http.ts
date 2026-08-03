export type ApiProblem = {
  code: string
  message: string
  retryable: boolean
  field?: string
  guidance?: string
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
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    throw new HttpError(0, {
      code: "backend_unreachable",
      message: "A Workbench não conseguiu falar com o backend",
      retryable: true,
      guidance: "Confirme que npm run dev continua em execução e tente novamente.",
      technicalDetail: error instanceof Error ? error.message : String(error),
    })
  }

  const responseText = await response.text()
  const payload = parseJsonResponse(responseText)

  if (!response.ok) throw new HttpError(response.status, normalizeProblem(payload, responseText))
  if (payload === undefined) {
    throw new HttpError(response.status, {
      code: "invalid_backend_response",
      message: "O backend respondeu sem JSON",
      retryable: true,
      guidance: "Tente novamente. Se persistir, reinicie o backend.",
      technicalDetail: responseText,
    })
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
        retryable: problem.retryable === true,
        field: typeof problem.field === "string" ? problem.field : undefined,
        guidance: typeof problem.guidance === "string" ? problem.guidance : undefined,
        technicalDetail: typeof problem.technicalDetail === "string" ? problem.technicalDetail : undefined,
      }
    }
  }

  if (isRecord(payload) && typeof payload.error === "string") {
    return {
      code: "legacy_api_error",
      message: stripHtml(payload.error),
      retryable: true,
      technicalDetail: responseText,
    }
  }

  return {
    code: "http_error",
    message: `O backend respondeu com HTTP ${responseText ? "e uma mensagem não reconhecida" : "sem conteúdo"}`,
    retryable: true,
    technicalDetail: stripHtml(responseText),
  }
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
  typeof value === "object" && value !== null

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

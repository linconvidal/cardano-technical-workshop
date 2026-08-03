export type ApiProblem = {
  code: string
  message: string
  retryable: boolean
  field?: string
  guidance?: string
  technicalDetail?: string
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ApiProblem,
  ) {
    super(problem.message)
    this.name = "ApiError"
  }
}

export class RequestValidationError extends ApiError {
  constructor(message: string, field?: string, guidance?: string) {
    super(400, {
      code: "invalid_request",
      message,
      retryable: false,
      field,
      guidance,
    })
    this.name = "RequestValidationError"
  }
}

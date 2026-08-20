import {
  formatMessage,
  messageRef,
  type Locale,
  type MessageRef,
  type MessageValues,
} from "../../../packages/localization/src/index.js"

export type ApiProblem = {
  code: string
  message: MessageRef
  retryable: boolean
  field?: string
  guidance?: MessageRef
  technicalDetail?: string
}

export type ApiProblemResult = {
  status: number
  problem: ApiProblem
}

export type LocalizedApiProblem = {
  code: string
  message: string
  messageKey: MessageRef["key"]
  messageValues: MessageValues
  retryable: boolean
  field?: string
  guidance?: string
  guidanceKey?: MessageRef["key"]
  guidanceValues?: MessageValues
  technicalDetail?: string
}

export const localizeApiProblem = (problem: ApiProblem, locale: Locale): LocalizedApiProblem => ({
  code: problem.code,
  message: formatMessage(problem.message, locale),
  messageKey: problem.message.key,
  messageValues: problem.message.values,
  retryable: problem.retryable,
  field: problem.field,
  guidance: problem.guidance ? formatMessage(problem.guidance, locale) : undefined,
  guidanceKey: problem.guidance?.key,
  guidanceValues: problem.guidance?.values,
  technicalDetail: problem.technicalDetail,
})

export const insufficientFundsProblem = (technicalDetail: string): ApiProblemResult | undefined => {
  if (!/insufficient|not enough|balance/i.test(technicalDetail)) return undefined
  return {
    status: 409,
    problem: {
      code: "insufficient_funds",
      message: messageRef("api.insufficientFunds.message"),
      retryable: false,
      guidance: messageRef("api.insufficientFunds.guidance"),
      technicalDetail,
    },
  }
}

export const workshopActionFailedProblem = (technicalDetail: string): ApiProblemResult => ({
  status: 422,
  problem: {
    code: "workshop_action_failed",
    message: messageRef("api.workshopActionFailed.message"),
    retryable: true,
    guidance: messageRef("api.workshopActionFailed.guidance"),
    technicalDetail,
  },
})

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ApiProblem,
  ) {
    super(formatMessage(problem.message))
    this.name = "ApiError"
  }
}

export class RequestValidationError extends ApiError {
  constructor(message: MessageRef, field?: string, guidance?: MessageRef) {
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

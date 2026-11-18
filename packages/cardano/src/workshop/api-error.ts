import { BlockfrostHttpError } from "../internal/blockfrost-client.js"

import {
  formatMessage,
  messageRef,
  type Locale,
  type MessageRef,
  type MessageValues,
} from "../../../localization/src/index.js"

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

export const toApiProblem = (error: unknown, projectId?: string): { status: number; problem: ApiProblem } => {
  if (error instanceof ApiError) return { status: error.status, problem: error.problem }

  if (error instanceof SyntaxError && "body" in error) {
    return {
      status: 400,
      problem: {
        code: "invalid_json",
        message: messageRef("api.invalidJson.message"),
        retryable: false,
        guidance: messageRef("api.invalidJson.guidance"),
        technicalDetail: redactTechnicalDetail(error.message, projectId),
      },
    }
  }

  if (error instanceof BlockfrostHttpError) {
    const authenticationFailure = error.status === 401 || error.status === 403
    const rateLimited = error.status === 429
    return {
      status: authenticationFailure || rateLimited ? 503 : 502,
      problem: {
        code: authenticationFailure
          ? "provider_authentication_failed"
          : rateLimited ? "provider_rate_limited" : "blockfrost_error",
        message: authenticationFailure
          ? messageRef("api.providerAuthenticationFailed.message")
          : rateLimited
            ? messageRef("api.providerRateLimited.message")
            : messageRef("api.blockfrostError.message"),
        retryable: rateLimited || error.status >= 500,
        guidance: authenticationFailure
          ? messageRef("api.providerAuthenticationFailed.guidance")
          : rateLimited
            ? messageRef("api.providerRateLimited.guidance")
            : messageRef("api.blockfrostError.guidance"),
        technicalDetail: redactTechnicalDetail(error.message, projectId),
      },
    }
  }

  const technicalDetail = redactTechnicalDetail(error instanceof Error ? error.message : String(error), projectId)
  if (technicalDetail.includes("Set BLOCKFROST_PROJECT_ID")) {
    return {
      status: 503,
      problem: {
        code: "provider_not_ready",
        message: messageRef("api.providerNotReady.message"),
        retryable: false,
        guidance: messageRef("api.providerNotReady.guidance"),
        technicalDetail,
      },
    }
  }

  if (/No UTxO found|Multiple script UTxOs|Script UTxO .* not found/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "script_utxo_unavailable",
        message: messageRef("api.scriptUtxoUnavailable.message"),
        retryable: true,
        guidance: messageRef("api.scriptUtxoUnavailable.guidance"),
        technicalDetail,
      },
    }
  }

  const insufficientFunds = insufficientFundsProblem(technicalDetail)
  if (insufficientFunds) return insufficientFunds

  if (/CIP-25|asset name|at most .* bytes/i.test(technicalDetail)) {
    return {
      status: 400,
      problem: {
        code: "invalid_asset_metadata",
        message: messageRef("api.invalidAssetMetadata.message"),
        retryable: false,
        guidance: messageRef("api.invalidAssetMetadata.guidance"),
        technicalDetail,
      },
    }
  }

  if (/CBOR|deseriali[sz]|decode|unexpected end/i.test(technicalDetail)) {
    return {
      status: 400,
      problem: {
        code: "invalid_transaction_cbor",
        message: messageRef("api.invalidTransactionCbor.message"),
        retryable: false,
        guidance: messageRef("api.invalidTransactionCbor.guidance"),
        technicalDetail,
      },
    }
  }

  if (/expired|validity interval|InvalidHereafter|outside.*validity/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "transaction_expired",
        message: messageRef("api.transactionExpired.message"),
        retryable: false,
        guidance: messageRef("api.transactionExpired.guidance"),
        technicalDetail,
      },
    }
  }

  if (/BadInputsUTxO|already spent|UTxO.*spent/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "input_already_spent",
        message: messageRef("api.inputAlreadySpent.message"),
        retryable: false,
        guidance: messageRef("api.inputAlreadySpent.guidance"),
        technicalDetail,
      },
    }
  }

  if (/429|rate.?limit|too many requests/i.test(technicalDetail)) {
    return {
      status: 503,
      problem: {
        code: "provider_rate_limited",
        message: messageRef("api.providerRateLimited.message"),
        retryable: true,
        guidance: messageRef("api.providerRateLimitedCurrentStep.guidance"),
        technicalDetail,
      },
    }
  }

  if (/401|403|unauthorized|forbidden|project.?id/i.test(technicalDetail)) {
    return {
      status: 503,
      problem: {
        code: "provider_authentication_failed",
        message: messageRef("api.providerAuthenticationFailed.message"),
        retryable: false,
        guidance: messageRef("api.providerAuthenticationFailed.guidance"),
        technicalDetail,
      },
    }
  }

  return workshopActionFailedProblem(technicalDetail)
}

const redactTechnicalDetail = (value: string, projectId?: string): string => {
  return projectId ? value.replaceAll(projectId, "[redacted Blockfrost project id]") : value
}

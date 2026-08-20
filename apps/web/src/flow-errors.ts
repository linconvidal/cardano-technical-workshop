import { messageRef, type MessageRef } from "../../../packages/localization/src/index.js"
import { HttpError } from "./http.js"
import type { FlowAction, FlowError } from "./workbench-state.js"

export class MessageError extends Error {
  constructor(
    readonly code: string,
    readonly messageRef: MessageRef,
    readonly guidanceRef?: MessageRef,
    readonly retryable = true,
    readonly technicalDetail?: string,
  ) {
    super(code)
    this.name = "MessageError"
  }
}

export const toFlowError = (action: FlowAction, error: unknown): FlowError => {
  if (error instanceof MessageError) {
    return {
      action,
      message: error.messageRef,
      guidance: error.guidanceRef ?? actionGuidance(action),
      technicalDetail: error.technicalDetail ?? error.code,
      retryable: error.retryable,
    }
  }

  if (action === "submit" && error instanceof HttpError && (error.status === 0 || error.status >= 500)) {
    return {
      action,
      message: messageRef("flow.error.submissionUnknown.message"),
      guidance: messageRef("flow.error.submissionUnknown.guidance"),
      technicalDetail: error.problem.technicalDetail,
      retryable: true,
    }
  }

  if (error instanceof HttpError && error.problem.code === "transaction_expired") {
    return {
      action,
      message: messageRef("flow.error.transactionExpired.message"),
      guidance: messageRef("flow.error.transactionExpired.guidance"),
      technicalDetail: error.problem.technicalDetail ?? error.problem.message,
      retryable: false,
    }
  }

  if (error instanceof HttpError) {
    return {
      action,
      message: error.problem.messageRef ?? messageRef("flow.error.backend.message"),
      guidance: error.problem.guidanceRef ?? actionGuidance(action),
      technicalDetail: error.problem.technicalDetail,
      retryable: error.problem.retryable,
    }
  }

  const technicalDetail = error instanceof Error ? error.message : String(error)
  return {
    action,
    message: action === "sign"
      ? messageRef("flow.error.sign.message")
      : messageRef("flow.error.generic.message"),
    guidance: actionGuidance(action),
    technicalDetail,
    retryable: true,
  }
}

const guidanceKeys = {
  build: "flow.guidance.build",
  sign: "flow.guidance.sign",
  merge: "flow.guidance.merge",
  submit: "flow.guidance.submit",
  check: "flow.guidance.check",
} as const satisfies Record<FlowAction, MessageRef["key"]>

const actionGuidance = (action: FlowAction): MessageRef => messageRef(guidanceKeys[action])

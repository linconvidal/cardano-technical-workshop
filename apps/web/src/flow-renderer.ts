import {
  formatMessage,
  messageRef,
  type Locale,
  type MessageKey,
  type MessageRef,
} from "../../../packages/localization/src/index.js"
import { transactionExplorerUrl, type RuntimeNetworkConfig } from "./readiness.js"
import { canRun, isAcknowledged, type FlowAction, type FlowState } from "./workbench-state.js"
import { select, selectWithin, setArtifactValue, setVisible } from "./workbench-ui.js"

export type FlowReadiness = {
  walletConnected: boolean
  canBuild: boolean
  backendReady: boolean
  network?: RuntimeNetworkConfig
}

export type CompletionKind = "step" | "exercise"

export type FlowView = {
  root: HTMLElement
  actions: Record<FlowAction, HTMLButtonElement>
  retry: HTMLButtonElement
  reset: HTMLButtonElement
  acknowledge: HTMLInputElement
  review: HTMLElement
  status: HTMLElement
  alert: HTMLElement
  alertMessage: HTMLElement
  alertGuidance: HTMLElement
  alertTechnical: HTMLElement
  completion: HTMLElement
  explorer: HTMLAnchorElement
  details: HTMLTextAreaElement
  unsigned: HTMLTextAreaElement
  witnesses: Array<HTMLTextAreaElement>
  signed: HTMLTextAreaElement
  txHash: HTMLTextAreaElement
}

export const createFlowView = (id: string, witnessIds: ReadonlyArray<string>): FlowView => {
  const root = select<HTMLElement>(`#${id}Panel`)
  return {
    root,
    actions: {
      build: select<HTMLButtonElement>(`#${id}Build`),
      sign: select<HTMLButtonElement>(`#${id}Sign`),
      merge: select<HTMLButtonElement>(`#${id}Merge`),
      submit: select<HTMLButtonElement>(`#${id}Submit`),
      check: select<HTMLButtonElement>(`#${id}Check`),
    },
    retry: select<HTMLButtonElement>(`#${id}Retry`),
    reset: select<HTMLButtonElement>(`#${id}Reset`),
    acknowledge: select<HTMLInputElement>(`#${id}Acknowledge`),
    review: select<HTMLElement>(`#${id}SubmitSummary`),
    status: select<HTMLElement>(`#${id}Status`),
    alert: select<HTMLElement>(`#${id}Alert`),
    alertMessage: selectWithin(root, ".alert-message"),
    alertGuidance: selectWithin(root, ".alert-guidance"),
    alertTechnical: selectWithin(root, ".alert-technical"),
    completion: select<HTMLElement>(`#${id}Completion`),
    explorer: select<HTMLAnchorElement>(`#${id}Explorer`),
    details: select<HTMLTextAreaElement>(`#${id}Details`),
    unsigned: select<HTMLTextAreaElement>(`#${id}Unsigned`),
    witnesses: witnessIds.map((witnessId) => select<HTMLTextAreaElement>(`#${witnessId}`)),
    signed: select<HTMLTextAreaElement>(`#${id}Signed`),
    txHash: select<HTMLTextAreaElement>(`#${id}TxHash`),
  }
}

export const renderFlow = (
  view: FlowView,
  state: FlowState,
  readiness: FlowReadiness,
  review: MessageRef,
  completion: MessageRef,
  completionKind: CompletionKind,
  locale: Locale,
) => {
  view.root.dataset.stage = state.stage
  view.root.setAttribute("aria-busy", state.busyAction ? "true" : "false")

  for (const [action, button] of Object.entries(view.actions) as Array<[FlowAction, HTMLButtonElement]>) {
    button.disabled = !canRun(state, action, readiness)
    button.setAttribute("aria-busy", state.busyAction === action ? "true" : "false")
  }

  view.acknowledge.disabled = state.stage !== "merged" && state.stage !== "submission-unknown"
  view.acknowledge.checked = isAcknowledged(state)
  view.review.textContent = formatMessage(review, locale)
  view.retry.hidden = !state.error?.retryable
  view.retry.textContent = formatMessage(messageRef(
    state.stage === "submission-unknown" ? "flow.action.checkInclusion" : "flow.action.retry",
  ), locale)
  view.retry.disabled = Boolean(state.busyAction)
  view.reset.hidden = state.stage === "draft" && !state.error
  view.reset.disabled = Boolean(state.busyAction)

  setArtifactValue(view.details, state.artifacts.details)
  setArtifactValue(view.unsigned, state.artifacts.unsigned)
  view.witnesses.forEach((element, index) => {
    setArtifactValue(element, state.artifacts.witnesses[index] ?? "")
  })
  setArtifactValue(view.signed, state.artifacts.signed)
  setArtifactValue(view.txHash, state.artifacts.txHash)

  view.status.textContent = statusText(state, readiness, locale)
  setVisible(view.alert, Boolean(state.error))
  if (state.error) {
    view.alertMessage.textContent = formatMessage(state.error.message, locale)
    view.alertGuidance.textContent = formatMessage(state.error.guidance, locale)
    view.alertTechnical.textContent = state.error.technicalDetail ?? formatMessage(
      messageRef("flow.error.noTechnicalDetail"),
      locale,
    )
  }

  setVisible(view.completion, state.stage === "included")
  if (state.stage === "included") renderCompletion(view.completion, completion, completionKind, locale)

  const explorerUrl = transactionExplorerUrl(readiness.network, state.artifacts.txHash)
  if (explorerUrl) view.explorer.href = explorerUrl
  else view.explorer.removeAttribute("href")
  setVisible(view.explorer, Boolean(explorerUrl))

  renderProgress(view.root, state)
}

const renderCompletion = (
  element: HTMLElement,
  message: MessageRef,
  kind: CompletionKind,
  locale: Locale,
) => {
  const document = element.ownerDocument
  const mark = document.createElement("span")
  mark.className = "completion-mark"
  mark.setAttribute("aria-hidden", "true")
  mark.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>'

  const body = document.createElement("span")
  body.className = "completion-body"
  const label = document.createElement("strong")
  label.className = "completion-label"
  label.textContent = formatMessage(messageRef(
    kind === "exercise" ? "flow.completion.exerciseLabel" : "flow.completion.stepLabel",
  ), locale)
  const copy = document.createElement("span")
  copy.className = "completion-message"
  copy.textContent = formatMessage(message, locale)
  body.append(label, copy)

  element.dataset.completionKind = kind
  element.setAttribute("aria-atomic", "true")
  element.replaceChildren(mark, body)
}

const renderProgress = (root: HTMLElement, state: FlowState) => {
  const completedActions = completedActionCount(state)
  root.querySelectorAll<HTMLElement>("[data-progress-step]").forEach((step, index) => {
    step.dataset.status = index < completedActions
      ? "complete"
      : index === completedActions && state.stage !== "included"
        ? "current"
        : "pending"
  })
}

const completedActionCount = (state: FlowState): number => {
  switch (state.stage) {
    case "draft": return 0
    case "built": return 1
    case "partially-signed": return 1
    case "signed": return 2
    case "merged": return 3
    case "submission-unknown": return 3
    case "submitted": return 4
    case "included": return 5
  }
}

const statusText = (state: FlowState, readiness: FlowReadiness, locale: Locale): string => {
  if (state.busyAction) return formatMessage(messageRef(busyKeys[state.busyAction]), locale)
  if (state.error) {
    const guidance = formatMessage(state.error.guidance, locale)
    return formatMessage(messageRef("flow.status.failed", { guidance }), locale)
  }
  if (state.notice) return formatMessage(state.notice, locale)
  if (state.stage === "draft") {
    const key = !readiness.backendReady
      ? "flow.status.waitBackend"
      : !readiness.walletConnected
        ? "flow.status.connectWallet"
        : !readiness.canBuild
          ? "flow.status.fundWallet"
          : "flow.status.draft"
    return formatMessage(messageRef(key), locale)
  }

  const statusKeys = {
    draft: "flow.status.draft",
    built: "flow.status.built",
    "partially-signed": "flow.status.partiallySigned",
    signed: "flow.status.signed",
    merged: "flow.status.merged",
    "submission-unknown": "flow.status.submissionUnknown",
    submitted: "flow.status.submitted",
    included: "flow.status.included",
  } as const satisfies Record<FlowState["stage"], MessageKey>
  return formatMessage(messageRef(statusKeys[state.stage]), locale)
}

const busyKeys = {
  build: "flow.busy.build",
  sign: "flow.busy.sign",
  merge: "flow.busy.merge",
  submit: "flow.busy.submit",
  check: "flow.busy.check",
} as const satisfies Record<FlowAction, MessageKey>

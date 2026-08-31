import {
  formatMessage,
  messageRef,
  type Locale,
  type MessageRef,
} from "../../../packages/localization/src/index.js"
import {
  runBuildAction,
  runCheckAction,
  runMergeAction,
  runSignAction,
  runSubmitAction,
  type FlowActionDependencies,
} from "./flow-actions.js"
import { bindFlowView } from "./flow-bindings.js"
import { toFlowError } from "./flow-errors.js"
import { HttpError } from "./http.js"
import { flowInputFingerprint, validateFlowInputs } from "./flow-inputs.js"
import {
  createFlowView,
  renderFlow,
  type CompletionKind,
  type FlowReadiness,
  type FlowView,
} from "./flow-renderer.js"
import {
  createFlowState,
  failAction,
  finishAction,
  invalidateForInputs,
  prepareSubmission,
  setAcknowledged,
  setImportedUnsigned,
  setWitness,
  startAction,
  type FlowAction,
  type FlowState,
} from "./workbench-state.js"
import { StatusPoller } from "./status-poller.js"
import type { LogLevel, WorkbenchLogger } from "./technical-log.js"
import { parseDetails, transactionHashFromCbor } from "./workbench-ui.js"

export type FlowControllerConfig = FlowActionDependencies & {
  id: string
  title: MessageRef
  witnessIds: ReadonlyArray<string>
  inputSelectors: ReadonlyArray<string>
  editableUnsigned?: boolean
  editableWitnessIndexes?: ReadonlyArray<number>
  inspectImported?: (unsignedCbor: string) => Record<string, unknown>
  validateBeforeSign?: (details: Record<string, unknown> | undefined) => Promise<void> | void
  validateBeforeSubmit?: (details: Record<string, unknown> | undefined) => Promise<void> | void
  signReview?: {
    checkboxId: string
    summaryId: string
    text: (details: Record<string, unknown> | undefined, locale: Locale) => MessageRef
  }
  review: (details: Record<string, unknown> | undefined, locale: Locale) => MessageRef
  completion: MessageRef
  completionKind: CompletionKind
  locale: () => Locale
  readiness: () => FlowReadiness
  onChange: () => void
  log: WorkbenchLogger
}

export class FlowController {
  private state: FlowState
  private revision = 0
  private readonly view: FlowView
  private readonly signAcknowledgement?: HTMLInputElement
  private readonly signReviewSummary?: HTMLElement
  private retryAction?: () => Promise<void>
  private readonly poller = new StatusPoller()

  constructor(private readonly config: FlowControllerConfig) {
    this.state = createFlowState(config.witnessIds.length)
    this.view = createFlowView(config.id, config.witnessIds)
    this.signAcknowledgement = config.signReview
      ? document.getElementById(config.signReview.checkboxId) as HTMLInputElement
      : undefined
    this.signReviewSummary = config.signReview
      ? document.getElementById(config.signReview.summaryId) ?? undefined
      : undefined
    this.signAcknowledgement?.addEventListener("change", () => this.render())
    bindFlowView(this.view, config, {
      build: () => { void this.build() },
      sign: () => { void this.sign() },
      merge: () => { void this.merge() },
      submit: () => { void this.submit() },
      check: () => { void this.checkStatus() },
      retry: () => { void this.retryAction?.() },
      reset: () => this.reset(),
      acknowledge: (accepted) => {
        this.state = setAcknowledged(this.state, accepted)
        this.commit()
      },
      inputMutation: () => this.handleInputMutation(),
      unsignedImport: (value) => this.importUnsigned(value),
      witnessImport: (index, value) => this.importWitness(index, value),
    })
    this.render()
  }

  snapshot(): FlowState {
    return this.state
  }

  isBusy(): boolean {
    return Boolean(this.state.busyAction)
  }

  restore(state: FlowState) {
    if (this.state.busyAction || state.requiredWitnesses !== this.config.witnessIds.length) return
    const emptyDraft = state.stage === "draft" && !hasTransactionArtifacts(state)
    this.state = {
      ...state,
      inputFingerprint: emptyDraft ? this.currentInputFingerprint() : state.inputFingerprint,
      busyAction: undefined,
      error: undefined,
      notice: emptyDraft ? undefined : state.notice,
      acknowledgedSignedFingerprint: undefined,
    }
    if (this.signAcknowledgement) this.signAcknowledgement.checked = false
    this.poller.stop()
    this.revision += 1
    this.render()
  }

  reset(askConfirmation = true) {
    if (this.state.busyAction) return
    if (
      askConfirmation &&
      this.state.artifacts.txHash &&
      !window.confirm(formatMessage(messageRef("flow.reset.confirm"), this.config.locale()))
    ) return

    this.poller.stop()
    this.revision += 1
    if (this.signAcknowledgement) this.signAcknowledgement.checked = false
    this.state = createFlowState(this.config.witnessIds.length)
    this.retryAction = undefined
    this.commit(messageRef("flow.log.reset", { flow: this.config.id }))
  }

  invalidate() {
    if (this.state.stage === "draft" && !this.state.artifacts.unsigned) return
    this.poller.stop()
    this.revision += 1
    this.state = invalidateForInputs(
      this.state,
      this.currentInputFingerprint(),
      messageRef("flow.notice.inputsInvalidated"),
    )
    this.commit(messageRef("flow.log.invalidated", { flow: this.config.id }))
  }

  refreshReadiness() {
    this.render()
  }

  rerenderForLocale() {
    this.render()
  }

  revalidateWalletAddress(currentAddress: string) {
    const details = parseDetails(this.state.artifacts.details)
    const expectedAddress = details?.userAddress ?? details?.firstSignerAddress
    if (typeof expectedAddress === "string" && expectedAddress !== currentAddress) {
      this.invalidate()
    }
  }

  private importUnsigned(value: string) {
    this.revision += 1
    if (this.signAcknowledgement) this.signAcknowledgement.checked = false

    try {
      const details = this.config.inspectImported?.(value)
      this.state = setImportedUnsigned(this.state, value, details ? JSON.stringify(details, null, 2) : "")
      this.commit(messageRef("flow.log.imported", { flow: this.config.id }))
    } catch (error) {
      this.retryAction = undefined
      this.state = failAction(this.state, {
        action: "sign",
        message: messageRef("flow.error.invalidImportedMultisig.message"),
        guidance: messageRef("flow.error.invalidImportedMultisig.guidance"),
        technicalDetail: error instanceof Error ? error.message : String(error),
        retryable: false,
      })
      this.commit(messageRef("flow.log.importRejected", { flow: this.config.id }), "error")
      queueMicrotask(() => this.view.alert.focus())
    }
  }

  private importWitness(index: number, value: string) {
    try {
      this.revision += 1
      this.state = setWitness(this.state, index, value)
      this.commit(messageRef("flow.log.witnessUpdated", { flow: this.config.id }))
    } catch (error) {
      this.fail("merge", error)
    }
  }

  private async build() {
    if (!validateFlowInputs(this.config.inputSelectors)) return
    if (this.signAcknowledgement) this.signAcknowledgement.checked = false
    this.poller.stop()
    this.state = invalidateForInputs(
      this.state,
      this.currentInputFingerprint(),
      messageRef("flow.notice.buildingNew"),
    )
    const completed = await this.perform(
      "build",
      (state) => runBuildAction(state, this.config, this.currentInputFingerprint()),
      () => this.build(),
    )
    if (completed) this.config.log(messageRef("flow.log.built", { flow: this.config.id }))
  }

  private async sign() {
    if (this.signAcknowledgement && !this.signAcknowledgement.checked) return
    const completed = await this.perform("sign", async (state) => {
      await this.config.validateBeforeSign?.(parseDetails(state.artifacts.details))
      return runSignAction(state, this.config)
    }, () => this.sign())
    if (completed) this.config.log(messageRef("flow.log.signed", { flow: this.config.id }))
  }

  private async merge() {
    const completed = await this.perform(
      "merge",
      async (state) => runMergeAction(state, this.config),
      () => this.merge(),
    )
    if (completed) this.config.log(messageRef("flow.log.merged", { flow: this.config.id }))
  }

  private async submit() {
    try {
      await this.config.validateBeforeSubmit?.(parseDetails(this.state.artifacts.details))
    } catch (error) {
      this.fail("submit", error)
      return
    }
    const completed = await this.perform(
      "submit",
      (state) => runSubmitAction(state, this.config),
      () => this.submit(),
      (state) => prepareSubmission(state, transactionHashFromCbor(state.artifacts.signed)),
    )
    if (!completed) return
    this.config.log(messageRef("flow.log.submitted", {
      flow: this.config.id,
      txHash: this.state.artifacts.txHash,
    }))
    this.poller.schedule(
      () => this.checkStatus(),
      () => this.state.stage === "submitted",
      4,
    )
  }

  private async checkStatus() {
    const completed = await this.perform(
      "check",
      (state) => runCheckAction(state, this.config),
      () => this.checkStatus(),
    )
    if (!completed || this.state.stage !== "included") return
    this.poller.stop()
    this.config.log(messageRef("flow.log.included", {
      flow: this.config.id,
      blockHeight: this.state.inclusion?.blockHeight ?? 0,
    }))
  }

  private async perform(
    action: FlowAction,
    operation: (state: FlowState) => Promise<FlowState>,
    retry: () => Promise<void>,
    prepare?: (state: FlowState) => FlowState,
  ): Promise<boolean> {
    if (this.state.busyAction) return false
    const otherBusyFlow = document.querySelector<HTMLElement>('[data-stage][aria-busy="true"]')
    if (otherBusyFlow && otherBusyFlow !== this.view.root) {
      this.retryAction = retry
      this.fail(action, new Error("concurrent_workbench_action"))
      return false
    }

    const startingRevision = this.revision
    const stableState = this.state
    const startingState = prepare?.(stableState) ?? stableState
    this.retryAction = retry
    this.state = startAction(startingState, action)
    this.setEditableState(false)
    this.commit()

    try {
      const candidate = await operation(startingState)
      if (startingRevision !== this.revision) {
        this.state = finishAction(this.state)
        this.retryAction = undefined
        this.setEditableState(true)
        this.commit()
        return false
      }

      this.state = finishAction(candidate)
      this.retryAction = undefined
      this.setEditableState(true)
      this.commit()
      return true
    } catch (error) {
      this.setEditableState(true)
      if (startingRevision !== this.revision) {
        this.state = finishAction(this.state)
        this.commit()
        return false
      }
      let conclusiveSubmissionFailure = false
      if (action === "submit" && this.state.stage === "submission-unknown") {
        if (isAmbiguousSubmissionError(error)) {
          this.retryAction = () => this.checkStatus()
        } else {
          conclusiveSubmissionFailure = true
          this.retryAction = undefined
          this.state = { ...stableState, acknowledgedSignedFingerprint: undefined }
        }
      }
      this.fail(action, error, conclusiveSubmissionFailure)
      return false
    }
  }

  private fail(action: FlowAction, error: unknown, forceNonRetryable = false) {
    const mappedError = toFlowError(action, error)
    const flowError = forceNonRetryable ? { ...mappedError, retryable: false } : mappedError
    this.state = failAction(this.state, flowError)
    this.commit(messageRef("flow.log.failed", { flow: this.config.id }), "error")
    queueMicrotask(() => this.view.alert.focus())
  }

  private handleInputMutation() {
    this.revision += 1
    if (this.signAcknowledgement) this.signAcknowledgement.checked = false
    const fingerprint = this.currentInputFingerprint()
    if (this.state.inputFingerprint === fingerprint) {
      this.commit()
      return
    }

    if (this.state.stage === "draft" && !hasTransactionArtifacts(this.state)) {
      this.state = {
        ...this.state,
        inputFingerprint: fingerprint,
        error: undefined,
        notice: undefined,
      }
    } else {
      this.state = invalidateForInputs(
        this.state,
        fingerprint,
        messageRef("flow.notice.inputsInvalidated"),
      )
    }
    this.commit()
  }

  private currentInputFingerprint(): string {
    return flowInputFingerprint(this.config.inputSelectors)
  }

  private setEditableState(enabled: boolean) {
    for (const selector of this.config.inputSelectors) {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)
      if (input) input.disabled = !enabled
    }
    if (this.config.editableUnsigned) this.view.unsigned.disabled = !enabled
    for (const index of this.config.editableWitnessIndexes ?? []) {
      this.view.witnesses[index].disabled = !enabled
    }
  }

  private commit(logMessage?: MessageRef, level: LogLevel = "info") {
    if (logMessage) this.config.log(logMessage, level)
    this.render()
    this.config.onChange()
  }

  private render() {
    const details = parseDetails(this.state.artifacts.details)
    const locale = this.config.locale()
    renderFlow(
      this.view,
      this.state,
      this.config.readiness(),
      this.config.review(details, locale),
      this.config.completion,
      this.config.completionKind,
      locale,
    )

    if (!this.signAcknowledgement || !this.config.signReview || !this.signReviewSummary) return
    const canReview = this.state.stage === "built" || this.state.stage === "partially-signed"
    this.signAcknowledgement.disabled = !canReview
    this.signReviewSummary.textContent = formatMessage(this.config.signReview.text(details, locale), locale)
    if (canReview && !this.signAcknowledgement.checked) this.view.actions.sign.disabled = true
  }
}

const hasTransactionArtifacts = (state: FlowState): boolean => Boolean(
  state.artifacts.details ||
  state.artifacts.unsigned ||
  state.artifacts.witnesses.some(Boolean) ||
  state.artifacts.signed ||
  state.artifacts.txHash,
)

const isAmbiguousSubmissionError = (error: unknown): boolean =>
  !(error instanceof HttpError) || error.status === 0 || error.status >= 500

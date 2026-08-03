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
import { createFlowView, renderFlow, type FlowReadiness, type FlowView } from "./flow-renderer.js"
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
  title: string
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
    text: (details: Record<string, unknown> | undefined) => string
  }
  review: (details: Record<string, unknown> | undefined) => string
  completion: string
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
    this.state = {
      ...state,
      busyAction: undefined,
      error: undefined,
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
      !window.confirm("Reiniciar limpa somente o estado local. A transação já submetida continua na Preprod. Continuar?")
    ) return

    this.poller.stop()
    this.revision += 1
    if (this.signAcknowledgement) this.signAcknowledgement.checked = false
    this.state = createFlowState(this.config.witnessIds.length)
    this.retryAction = undefined
    this.commit(`${this.config.title}: estado local reiniciado.`)
  }

  invalidate(reason: string) {
    if (this.state.stage === "draft" && !this.state.artifacts.unsigned) return
    this.poller.stop()
    this.revision += 1
    this.state = invalidateForInputs(this.state, this.currentInputFingerprint(), reason)
    this.commit(`${this.config.title}: artefatos anteriores invalidados.`)
  }

  refreshReadiness() {
    this.render()
  }

  revalidateWalletAddress(currentAddress: string) {
    const details = parseDetails(this.state.artifacts.details)
    const expectedAddress = details?.userAddress ?? details?.firstSignerAddress
    if (typeof expectedAddress === "string" && expectedAddress !== currentAddress) {
      this.invalidate("A wallet conectada não corresponde à wallet que construiu os artefatos restaurados. Reconstrua a transação.")
    }
  }

  private importUnsigned(value: string) {
    this.revision += 1
    if (this.signAcknowledgement) this.signAcknowledgement.checked = false

    try {
      const details = this.config.inspectImported?.(value)
      this.state = setImportedUnsigned(this.state, value, details ? JSON.stringify(details, null, 2) : "")
      this.commit(`${this.config.title}: unsigned CBOR importado, inspecionado e pronto para revisão.`)
    } catch (error) {
      this.retryAction = undefined
      this.state = failAction(this.state, {
        action: "sign",
        message: "O unsigned CBOR importado não passou na validação multisig",
        guidance: "Confirme que recebeu o CBOR de unlock correto e cole novamente. Nenhuma assinatura foi produzida.",
        technicalDetail: error instanceof Error ? error.message : String(error),
        retryable: false,
      })
      this.commit(`${this.config.title}: CBOR importado rejeitado.`, "error")
      queueMicrotask(() => this.view.alert.focus())
    }
  }

  private importWitness(index: number, value: string) {
    try {
      this.revision += 1
      this.state = setWitness(this.state, index, value)
      this.commit(`${this.config.title}: witness recebido atualizado.`)
    } catch (error) {
      this.fail("merge", error)
    }
  }

  private async build() {
    if (!validateFlowInputs(this.config.inputSelectors)) return
    if (this.signAcknowledgement) this.signAcknowledgement.checked = false
    this.poller.stop()
    this.state = invalidateForInputs(this.state, this.currentInputFingerprint(), "Construindo uma nova transação.")
    const completed = await this.perform(
      "build",
      (state) => runBuildAction(state, this.config, this.currentInputFingerprint()),
      () => this.build(),
    )
    if (completed) this.config.log(`${this.config.title}: unsigned transaction construída.`)
  }

  private async sign() {
    if (this.signAcknowledgement && !this.signAcknowledgement.checked) return
    const completed = await this.perform("sign", async (state) => {
      await this.config.validateBeforeSign?.(parseDetails(state.artifacts.details))
      return runSignAction(state, this.config)
    }, () => this.sign())
    if (completed) this.config.log(`${this.config.title}: witness criado pela wallet conectada.`)
  }

  private async merge() {
    const completed = await this.perform(
      "merge",
      async (state) => runMergeAction(state, this.config),
      () => this.merge(),
    )
    if (completed) this.config.log(`${this.config.title}: witnesses validados e anexados.`)
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
    this.config.log(`${this.config.title}: submetida com hash ${this.state.artifacts.txHash}.`)
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
    this.config.log(`${this.config.title}: incluída no bloco ${this.state.inclusion?.blockHeight}.`)
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
      this.fail(action, new Error("Outra etapa da Workbench ainda está em andamento"))
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
    this.commit(`${this.config.title}: ${flowError.message}`, "error")
    queueMicrotask(() => this.view.alert.focus())
  }

  private handleInputMutation() {
    this.revision += 1
    if (this.signAcknowledgement) this.signAcknowledgement.checked = false
    const fingerprint = this.currentInputFingerprint()
    if (this.state.stage !== "draft" || this.state.inputFingerprint !== fingerprint) {
      this.state = invalidateForInputs(
        this.state,
        fingerprint,
        "Os campos mudaram. Os artefatos anteriores foram removidos para impedir uma submissão antiga.",
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

  private commit(logMessage?: string, level: LogLevel = "info") {
    if (logMessage) this.config.log(logMessage, level)
    this.render()
    this.config.onChange()
  }

  private render() {
    const details = parseDetails(this.state.artifacts.details)
    renderFlow(
      this.view,
      this.state,
      this.config.readiness(),
      this.config.review(details),
      this.config.completion,
    )

    if (!this.signAcknowledgement || !this.config.signReview || !this.signReviewSummary) return
    const canReview = this.state.stage === "built" || this.state.stage === "partially-signed"
    this.signAcknowledgement.disabled = !canReview
    this.signReviewSummary.textContent = this.config.signReview.text(details)
    if (canReview && !this.signAcknowledgement.checked) this.view.actions.sign.disabled = true
  }
}

const isAmbiguousSubmissionError = (error: unknown): boolean =>
  !(error instanceof HttpError) || error.status === 0 || error.status >= 500

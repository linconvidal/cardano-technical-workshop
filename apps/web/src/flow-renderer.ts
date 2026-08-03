import { canRun, isAcknowledged, type FlowAction, type FlowState } from "./workbench-state.js"
import { select, selectWithin, setVisible } from "./workbench-ui.js"

export type FlowReadiness = {
  walletConnected: boolean
  canBuild: boolean
  backendReady: boolean
}

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
  reviewText: string,
  completionText: string,
) => {
  view.root.dataset.stage = state.stage
  view.root.setAttribute("aria-busy", state.busyAction ? "true" : "false")

  for (const [action, button] of Object.entries(view.actions) as Array<[FlowAction, HTMLButtonElement]>) {
    button.disabled = !canRun(state, action, readiness)
    button.setAttribute("aria-busy", state.busyAction === action ? "true" : "false")
  }

  view.acknowledge.disabled = state.stage !== "merged" && state.stage !== "submission-unknown"
  view.acknowledge.checked = isAcknowledged(state)
  view.review.textContent = reviewText
  view.retry.hidden = !state.error?.retryable
  view.retry.textContent = state.stage === "submission-unknown" ? "Verificar inclusão" : "Tentar novamente"
  view.retry.disabled = Boolean(state.busyAction)
  view.reset.hidden = state.stage === "draft" && !state.error
  view.reset.disabled = Boolean(state.busyAction)

  view.details.value = state.artifacts.details
  view.unsigned.value = state.artifacts.unsigned
  view.witnesses.forEach((element, index) => { element.value = state.artifacts.witnesses[index] ?? "" })
  view.signed.value = state.artifacts.signed
  view.txHash.value = state.artifacts.txHash

  view.status.textContent = statusText(state)
  setVisible(view.alert, Boolean(state.error))
  if (state.error) {
    view.alertMessage.textContent = state.error.message
    view.alertGuidance.textContent = state.error.guidance
    view.alertTechnical.textContent = state.error.technicalDetail ?? "Sem detalhe técnico adicional."
  }

  setVisible(view.completion, state.stage === "included")
  if (state.stage === "included") view.completion.textContent = completionText

  const hasHash = Boolean(state.artifacts.txHash)
  view.explorer.href = hasHash
    ? `https://preprod.cardanoscan.io/transaction/${state.artifacts.txHash}`
    : "#"
  setVisible(view.explorer, hasHash)

  renderProgress(view.root, state)
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

const statusText = (state: FlowState): string => {
  if (state.busyAction) return busyText(state.busyAction)
  if (state.error) return `A etapa falhou. ${state.error.guidance}`
  if (state.notice) return state.notice

  switch (state.stage) {
    case "draft": return "Próximo passo: preencha os campos e construa a transação."
    case "built": return "Próximo passo: confira o unsigned CBOR e peça a assinatura da wallet."
    case "partially-signed": return "Próximo passo: obtenha o witness que ainda falta."
    case "signed": return "Próximo passo: anexe os witnesses à transação."
    case "merged": return "Próximo passo: revise o efeito, confirme a ciência e submeta na Preprod."
    case "submission-unknown": return "O hash foi calculado, mas o resultado da submissão é desconhecido. Verifique a inclusão antes de reconstruir."
    case "submitted": return "Próximo passo: aguarde a indexação ou verifique novamente."
    case "included": return "Concluído: a transação foi incluída em um bloco da Preprod."
  }
}

const busyText = (action: FlowAction): string => ({
  build: "Construindo a transação com o estado atual da Preprod...",
  sign: "Aguardando a decisão na extensão da wallet...",
  merge: "Validando e anexando os witnesses...",
  submit: "Submetendo a transação assinada à Preprod...",
  check: "Verificando a inclusão da transação...",
})[action]

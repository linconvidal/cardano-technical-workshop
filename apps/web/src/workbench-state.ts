import { fingerprint } from "./flow-fingerprint.js"

export type FlowStage =
  | "draft"
  | "built"
  | "partially-signed"
  | "signed"
  | "merged"
  | "submission-unknown"
  | "submitted"
  | "included"

export type FlowAction = "build" | "sign" | "merge" | "submit" | "check"

export type FlowError = {
  action: FlowAction
  message: string
  guidance: string
  technicalDetail?: string
  retryable: boolean
}

export type Inclusion = {
  block: string
  blockHeight: number
  blockTime: number
}

export type FlowArtifacts = {
  details: string
  unsigned: string
  witnesses: Array<string>
  signed: string
  txHash: string
}

export type FlowState = {
  requiredWitnesses: number
  stage: FlowStage
  inputFingerprint: string
  artifacts: FlowArtifacts
  acknowledgedSignedFingerprint?: string
  inclusion?: Inclusion
  busyAction?: FlowAction
  error?: FlowError
  notice?: string
  unknownStatusChecked?: boolean
}

export const createFlowState = (requiredWitnesses = 1): FlowState => ({
  requiredWitnesses,
  stage: "draft",
  inputFingerprint: "",
  artifacts: {
    details: "",
    unsigned: "",
    witnesses: Array.from({ length: requiredWitnesses }, () => ""),
    signed: "",
    txHash: "",
  },
})

export const setBuild = (
  state: FlowState,
  details: string,
  unsigned: string,
  inputFingerprint: string,
): FlowState => ({
  ...createFlowState(state.requiredWitnesses),
  stage: "built",
  inputFingerprint,
  artifacts: {
    ...createFlowState(state.requiredWitnesses).artifacts,
    details,
    unsigned: requireValue(unsigned, "unsigned tx CBOR"),
  },
  notice: "Transação construída. Confira os detalhes antes de pedir a assinatura.",
})

export const setImportedUnsigned = (state: FlowState, unsigned: string, details = ""): FlowState => {
  const clean = unsigned.trim()
  if (!clean) return createFlowState(state.requiredWitnesses)

  return {
    ...createFlowState(state.requiredWitnesses),
    stage: "built",
    artifacts: {
      ...createFlowState(state.requiredWitnesses).artifacts,
      details,
      unsigned: clean,
    },
    notice: "CBOR importado. Ele ainda precisa ser assinado pela wallet correta.",
  }
}

export const setWitness = (state: FlowState, index: number, witness: string): FlowState => {
  if (!state.artifacts.unsigned) throw new Error("Construa ou importe o unsigned tx CBOR antes de assinar")
  if (index < 0 || index >= state.requiredWitnesses) throw new Error("Índice de witness inválido")

  const witnesses = [...state.artifacts.witnesses]
  witnesses[index] = witness.trim()
  const next = clearFromMerge({
    ...state,
    artifacts: { ...state.artifacts, witnesses },
    error: undefined,
    busyAction: undefined,
  })
  const supplied = witnesses.filter(Boolean).length

  return {
    ...next,
    stage: supplied >= state.requiredWitnesses ? "signed" : supplied > 0 ? "partially-signed" : "built",
    notice: supplied >= state.requiredWitnesses
      ? "Todas as assinaturas necessárias estão disponíveis."
      : `${supplied} de ${state.requiredWitnesses} assinaturas disponíveis.`,
  }
}

export const setMerged = (state: FlowState, signed: string): FlowState => {
  const supplied = state.artifacts.witnesses.filter(Boolean).length
  if (supplied < state.requiredWitnesses) {
    throw new Error(`Ainda faltam ${state.requiredWitnesses - supplied} witness sets`)
  }

  return {
    ...state,
    stage: "merged",
    artifacts: {
      ...state.artifacts,
      signed: requireValue(signed, "signed tx CBOR"),
      txHash: "",
    },
    acknowledgedSignedFingerprint: undefined,
    inclusion: undefined,
    error: undefined,
    busyAction: undefined,
    notice: "Witnesses anexados. Revise o efeito antes de submeter.",
  }
}

export const setAcknowledged = (state: FlowState, accepted: boolean): FlowState => ({
  ...state,
  acknowledgedSignedFingerprint: accepted && state.artifacts.signed
    ? fingerprint(state.artifacts.signed)
    : undefined,
})

export const prepareSubmission = (state: FlowState, txHash: string): FlowState => ({
  ...state,
  stage: "submission-unknown",
  artifacts: { ...state.artifacts, txHash: requireValue(txHash, "tx hash") },
  inclusion: undefined,
  error: undefined,
  unknownStatusChecked: false,
  notice: "Hash calculado localmente. A resposta da submissão ainda é desconhecida.",
})

export const setSubmitted = (state: FlowState, txHash: string): FlowState => ({
  ...state,
  stage: "submitted",
  artifacts: { ...state.artifacts, txHash: requireValue(txHash, "tx hash") },
  inclusion: undefined,
  error: undefined,
  busyAction: undefined,
  unknownStatusChecked: undefined,
  notice: "Transação aceita para submissão. A inclusão em bloco ainda precisa ser confirmada.",
})

export const setIncluded = (state: FlowState, inclusion: Inclusion): FlowState => ({
  ...state,
  stage: "included",
  inclusion,
  error: undefined,
  busyAction: undefined,
  notice: `Transação incluída no bloco ${inclusion.blockHeight}.`,
})

export const invalidateForInputs = (state: FlowState, inputFingerprint: string, reason: string): FlowState => ({
  ...createFlowState(state.requiredWitnesses),
  inputFingerprint,
  notice: reason,
})

export const startAction = (state: FlowState, action: FlowAction): FlowState => ({
  ...state,
  busyAction: action,
  error: undefined,
  notice: undefined,
})

export const finishAction = (state: FlowState): FlowState => ({
  ...state,
  busyAction: undefined,
})

export const failAction = (state: FlowState, error: FlowError): FlowState => ({
  ...state,
  busyAction: undefined,
  error,
})

export const canRun = (
  state: FlowState,
  action: FlowAction,
  readiness: { walletConnected: boolean; canBuild: boolean; backendReady: boolean },
): boolean => {
  if (state.busyAction) return false

  switch (action) {
    case "build": return state.stage === "draft" && readiness.canBuild
    case "sign": return (state.stage === "built" || state.stage === "partially-signed") && readiness.walletConnected
    case "merge": return state.stage === "signed"
    case "submit": return (
      state.stage === "merged" || (state.stage === "submission-unknown" && state.unknownStatusChecked === true)
    ) && isAcknowledged(state) && readiness.walletConnected && readiness.backendReady
    case "check": return (state.stage === "submission-unknown" || state.stage === "submitted") && readiness.backendReady
  }
}

export const isAcknowledged = (state: FlowState): boolean =>
  Boolean(
    state.artifacts.signed &&
    state.acknowledgedSignedFingerprint === fingerprint(state.artifacts.signed),
  )

const clearFromMerge = (state: FlowState): FlowState => ({
  ...state,
  artifacts: { ...state.artifacts, signed: "", txHash: "" },
  acknowledgedSignedFingerprint: undefined,
  inclusion: undefined,
})

const requireValue = (value: string, label: string): string => {
  const clean = value.trim()
  if (clean) return clean
  throw new Error(`Informe ${label}`)
}

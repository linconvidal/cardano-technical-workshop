import { getJson, postJson } from "./http.js"
import {
  finishAction,
  setBuild,
  setIncluded,
  setMerged,
  setSubmitted,
  setWitness,
  type FlowState,
} from "./workbench-state.js"
import {
  mergeWitnesses,
  parseDetails,
  renderJson,
  type TxBuildResponse,
  type TxStatusResponse,
} from "./workbench-ui.js"

export type FlowActionDependencies = {
  build: () => Promise<TxBuildResponse>
  sign: (unsigned: string) => Promise<string>
  submit?: (signed: string) => Promise<{ txHash: string }>
  checkStatus?: (txHash: string) => Promise<TxStatusResponse>
  expectedSignerHashes?: (details: Record<string, unknown> | undefined) => ReadonlyArray<string> | undefined
}

export const runBuildAction = async (
  state: FlowState,
  dependencies: FlowActionDependencies,
  inputFingerprint: string,
): Promise<FlowState> => {
  const result = await dependencies.build()
  return setBuild(state, renderJson(result.details), result.txCbor, inputFingerprint)
}

export const runSignAction = async (
  state: FlowState,
  dependencies: FlowActionDependencies,
): Promise<FlowState> => setWitness(
  state,
  0,
  await dependencies.sign(state.artifacts.unsigned),
)

export const runMergeAction = (state: FlowState, dependencies: FlowActionDependencies): FlowState => {
  const details = parseDetails(state.artifacts.details)
  return setMerged(state, mergeWitnesses(
    state.artifacts.unsigned,
    state.artifacts.witnesses,
    dependencies.expectedSignerHashes?.(details),
  ))
}

export const runSubmitAction = async (
  state: FlowState,
  dependencies: FlowActionDependencies,
): Promise<FlowState> => {
  const submit = dependencies.submit ?? ((signed: string) =>
    postJson<{ txHash: string }>("/api/submit-tx", { signedTxCbor: signed }))
  const { txHash } = await submit(state.artifacts.signed)
  if (state.artifacts.txHash && state.artifacts.txHash !== txHash) {
    throw new Error(`O backend retornou ${txHash}, mas o signed CBOR calcula ${state.artifacts.txHash}`)
  }
  return setSubmitted(state, txHash)
}

export const runCheckAction = async (
  state: FlowState,
  dependencies: FlowActionDependencies,
): Promise<FlowState> => {
  const check = dependencies.checkStatus ?? ((txHash: string) =>
    getJson<TxStatusResponse>(`/api/transactions/${txHash}/status`))
  const result = await check(state.artifacts.txHash)

  if (result.status === "included") return setIncluded(state, result)
  return {
    ...finishAction(state),
    unknownStatusChecked: state.stage === "submission-unknown" ? true : state.unknownStatusChecked,
    notice: "O Blockfrost ainda não indexa este hash. Isso não confirma nem rejeita a submissão. Aguarde e verifique novamente.",
  }
}

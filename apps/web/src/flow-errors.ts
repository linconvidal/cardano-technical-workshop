import { HttpError } from "./http.js"
import type { FlowAction, FlowError } from "./workbench-state.js"

export const toFlowError = (action: FlowAction, error: unknown): FlowError => {
  if (action === "submit" && error instanceof HttpError && (error.status === 0 || error.status >= 500)) {
    return {
      action,
      message: "O resultado da submissão é desconhecido",
      guidance: "Use o hash calculado e verifique a inclusão antes de tentar submeter o mesmo signed CBOR novamente.",
      technicalDetail: error.problem.technicalDetail,
      retryable: true,
    }
  }

  const observedDetail = error instanceof HttpError
    ? error.problem.technicalDetail ?? error.problem.message
    : error instanceof Error ? error.message : String(error)
  if (/validade.*expir|policy.*expir|expired/i.test(observedDetail)) {
    return {
      action,
      message: "A validade da policy do mint expirou",
      guidance: "Reinicie o exercício e construa um novo mint para obter outra janela de validade.",
      technicalDetail: observedDetail,
      retryable: false,
    }
  }

  if (error instanceof HttpError) {
    return {
      action,
      message: error.problem.message,
      guidance: error.problem.guidance ?? actionGuidance(action),
      technicalDetail: error.problem.technicalDetail,
      retryable: error.problem.retryable,
    }
  }

  const technicalDetail = error instanceof Error ? error.message : String(error)
  return {
    action,
    message: action === "sign" ? "A wallet não produziu a assinatura" : "A etapa não pôde ser concluída",
    guidance: actionGuidance(action),
    technicalDetail,
    retryable: true,
  }
}

const actionGuidance = (action: FlowAction): string => ({
  build: "Confira os campos, a rede Preprod e o saldo de tADA. Depois, tente construir novamente.",
  sign: "Confira a extensão, conecte a wallet correta e aprove a assinatura. Depois, tente novamente.",
  merge: "Confira se os witnesses pertencem ao mesmo unsigned CBOR e tente anexá-los novamente.",
  submit: "Preserve o signed CBOR e o hash, se houver. Tente novamente ou consulte o Cardanoscan antes de reconstruir.",
  check: "Aguarde alguns segundos e verifique novamente. O hash submetido foi preservado.",
})[action]

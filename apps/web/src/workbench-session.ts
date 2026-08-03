import type { FlowState } from "./workbench-state.js"
import { transactionHashFromCbor } from "./workbench-ui.js"

export type WorkbenchSession = {
  version: 1
  savedAt: string
  inputs: Record<string, string>
  flows: Record<string, FlowState>
}

export const serializeSession = (
  inputs: Record<string, string>,
  flows: Record<string, FlowState>,
): string => JSON.stringify({
  version: 1,
  savedAt: new Date().toISOString(),
  inputs,
  flows: Object.fromEntries(Object.entries(flows).map(([name, state]) => [name, {
    ...state,
    busyAction: undefined,
    error: undefined,
  }])),
} satisfies WorkbenchSession)

export const parseSession = (raw: string | null): WorkbenchSession | undefined => {
  if (!raw) return undefined

  try {
    const value = JSON.parse(raw) as Partial<WorkbenchSession>
    if (value.version !== 1 || typeof value.savedAt !== "string" || !isStringRecord(value.inputs) || !isRecord(value.flows)) {
      return undefined
    }
    if (!Object.values(value.flows).every(isFlowState)) return undefined
    return value as WorkbenchSession
  } catch {
    return undefined
  }
}

export const hasProgress = (session: WorkbenchSession): boolean =>
  Object.values(session.flows).some((flow) => flow.stage !== "draft")

const stages = new Set([
  "draft",
  "built",
  "partially-signed",
  "signed",
  "merged",
  "submission-unknown",
  "submitted",
  "included",
])

const isFlowState = (value: unknown): value is FlowState => {
  if (!isRecord(value) || !isRecord(value.artifacts)) return false
  const artifacts = value.artifacts
  const requiredWitnesses = Number(value.requiredWitnesses)
  if (!Number.isInteger(requiredWitnesses) || requiredWitnesses < 1) return false
  if (typeof value.stage !== "string" || !stages.has(value.stage)) return false
  if (typeof value.inputFingerprint !== "string" || !Array.isArray(artifacts.witnesses)) return false
  if (artifacts.witnesses.length !== requiredWitnesses) return false
  if (!["details", "unsigned", "signed", "txHash"].every((field) => typeof artifacts[field] === "string")) return false
  if (!artifacts.witnesses.every((witness) => typeof witness === "string")) return false
  if (value.acknowledgedSignedFingerprint !== undefined && typeof value.acknowledgedSignedFingerprint !== "string") return false
  if (value.notice !== undefined && typeof value.notice !== "string") return false
  if (value.unknownStatusChecked !== undefined && typeof value.unknownStatusChecked !== "boolean") return false
  if (value.busyAction !== undefined || value.error !== undefined) return false

  const suppliedWitnesses = artifacts.witnesses.filter(Boolean).length
  const hasUnsigned = Boolean(artifacts.unsigned)
  const hasSigned = Boolean(artifacts.signed)
  const hasHash = /^[0-9a-f]{64}$/i.test(String(artifacts.txHash))
  const validInclusion = isInclusion(value.inclusion)
  const terminalArtifactsValid = hasUnsigned && suppliedWitnesses === requiredWitnesses &&
    hasSigned && hasHash && signedHashMatches(String(artifacts.signed), String(artifacts.txHash))

  switch (value.stage) {
    case "draft": return !hasUnsigned && !hasSigned && !artifacts.txHash && suppliedWitnesses === 0 && value.inclusion === undefined
    case "built": return hasUnsigned && !hasSigned && !artifacts.txHash && suppliedWitnesses === 0 && value.inclusion === undefined
    case "partially-signed": return hasUnsigned && suppliedWitnesses > 0 && suppliedWitnesses < requiredWitnesses && !hasSigned && !artifacts.txHash && value.inclusion === undefined
    case "signed": return hasUnsigned && suppliedWitnesses === requiredWitnesses && !hasSigned && !artifacts.txHash && value.inclusion === undefined
    case "merged": return hasUnsigned && suppliedWitnesses === requiredWitnesses && hasSigned && !artifacts.txHash && value.inclusion === undefined
    case "submission-unknown": return terminalArtifactsValid && value.inclusion === undefined
    case "submitted": return terminalArtifactsValid && value.inclusion === undefined
    case "included": return terminalArtifactsValid && validInclusion
    default: return false
  }
}

const signedHashMatches = (signed: string, txHash: string): boolean => {
  try {
    return transactionHashFromCbor(signed) === txHash.toLowerCase()
  } catch {
    return false
  }
}

const isInclusion = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.block === "string" &&
  typeof value.blockHeight === "number" && Number.isFinite(value.blockHeight) &&
  typeof value.blockTime === "number" && Number.isFinite(value.blockTime)

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((entry) => typeof entry === "string")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

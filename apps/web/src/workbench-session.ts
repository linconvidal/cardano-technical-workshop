import { isMessageRef } from "../../../packages/localization/src/index.js"
import { stageDerivedNotice, type FlowState } from "./workbench-state.js"
import { transactionHashFromCbor } from "./workbench-ui.js"

export type WorkbenchSession = {
  version: 2
  savedAt: string
  inputs: Record<string, string>
  flows: Record<string, FlowState>
}

type LegacyFlowState = Omit<FlowState, "notice"> & { notice?: string }

export const serializeSession = (
  inputs: Record<string, string>,
  flows: Record<string, FlowState>,
): string => JSON.stringify({
  version: 2,
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
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) return undefined
    if (typeof value.savedAt !== "string" || !isStringRecord(value.inputs) || !isRecord(value.flows)) return undefined
    const noticeVersion = value.version
    if (!Object.values(value.flows).every((flow) => isFlowState(flow, noticeVersion))) return undefined
    if (noticeVersion === 1) return migrateV1(value.savedAt, value.inputs, value.flows)
    return value as WorkbenchSession
  } catch {
    return undefined
  }
}

export const hasProgress = (session: WorkbenchSession): boolean =>
  Object.values(session.flows).some((flow) => flow.stage !== "draft")

const migrateV1 = (
  savedAt: string,
  inputs: Record<string, string>,
  flows: Record<string, unknown>,
): WorkbenchSession => ({
  version: 2,
  savedAt,
  inputs,
  flows: Object.fromEntries(Object.entries(flows).map(([name, state]) => {
    const legacy = state as LegacyFlowState
    const migrated = { ...legacy, notice: undefined } as FlowState
    return [name, {
      ...migrated,
      notice: legacy.notice === undefined ? undefined : stageDerivedNotice(migrated),
    }]
  })),
})

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

const isFlowState = (value: unknown, noticeVersion: 1 | 2): boolean => {
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
  if (!validNotice(value.notice, noticeVersion)) return false
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

const validNotice = (value: unknown, version: 1 | 2): boolean => {
  if (value === undefined) return true
  return version === 1 ? typeof value === "string" : isMessageRef(value)
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

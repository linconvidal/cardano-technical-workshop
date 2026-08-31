export const stepCodeFlowIds = [
  "payment",
  "metadata",
  "multisigLock",
  "multisigUnlock",
  "eacMint",
  "eacRetire",
  "mint",
] as const

export type StepCodeFlowId = typeof stepCodeFlowIds[number]

export const stepCodeFlowRoots: Readonly<Record<StepCodeFlowId, string>> = {
  payment: "#paymentPanel",
  metadata: "#metadataPanel",
  multisigLock: "#multisigLockPanel",
  multisigUnlock: "#multisigUnlockPanel",
  eacMint: "#eacMintPanel",
  eacRetire: "#eacRetirePanel",
  mint: "#mintPanel",
}

export const stepCodeSourcePaths = {
  payment: "packages/cardano/src/workshop/01-payment.ts",
  metadata: "packages/cardano/src/workshop/02-metadata.ts",
  multisig: "packages/cardano/src/workshop/04-multisig.ts",
  eac: "packages/cardano/src/workshop/04a-mint-eac.ts",
  mint: "packages/cardano/src/workshop/03-mint-cip25.ts",
  wallet: "apps/web/src/wallet.ts",
  workbenchUi: "apps/web/src/workbench-ui.ts",
  flowController: "apps/web/src/flow-controller.ts",
  server: "apps/api/src/server.ts",
  blockfrost: "packages/cardano/src/internal/blockfrost-client.ts",
} as const

type StepCodeSourceId = keyof typeof stepCodeSourcePaths
export type StepCodeSources = Readonly<Record<StepCodeSourceId, string>>

export type StepCodeExcerptDefinition = {
  source: StepCodeSourceId
  from: string
  until?: string
}

export type StepCodeDefinition = {
  excerpts: ReadonlyArray<StepCodeExcerptDefinition>
}

export type ExtractedCodeExcerpt = {
  path: string
  code: string
  startLine: number
  endLine: number
}

const githubSourceRoot = "https://github.com/linconvidal/cardano-technical-workshop/blob"

export const githubSourceHref = (
  excerpt: ExtractedCodeExcerpt,
  revision: string,
): string | undefined => /^[0-9a-f]{40}$/i.test(revision)
  ? `${githubSourceRoot}/${revision.toLowerCase()}/${excerpt.path}#L${excerpt.startLine}-L${excerpt.endLine}`
  : undefined

const sign: StepCodeExcerptDefinition = {
  source: "wallet",
  from: "export const signWithWallet",
  until: "const titleCase",
}

const attach: StepCodeExcerptDefinition = {
  source: "workbenchUi",
  from: "export const mergeWitnesses",
  until: "export const transactionHashFromCbor",
}

const submit: StepCodeExcerptDefinition = {
  source: "server",
  from: 'app.post("/api/submit-tx"',
  until: "if (existsSync(distPath))",
}

const confirm: StepCodeExcerptDefinition = {
  source: "blockfrost",
  from: "export const getTransactionInclusion",
  until: "export const deriveAddressFromSeed",
}

const standardSteps = (
  build: StepCodeExcerptDefinition,
): ReadonlyArray<StepCodeDefinition> => [
  { excerpts: [build] },
  { excerpts: [sign] },
  { excerpts: [attach] },
  { excerpts: [submit] },
  { excerpts: [confirm] },
]

export const stepCodeDefinitions: Readonly<Record<StepCodeFlowId, ReadonlyArray<StepCodeDefinition>>> = {
  payment: standardSteps({
    source: "payment",
    from: "export const buildPaymentTx",
  }),
  metadata: standardSteps({
    source: "metadata",
    from: "export const buildMetadataTx",
  }),
  multisigLock: standardSteps({
    source: "multisig",
    from: "export const buildMultisigLockTx",
    until: "export const buildMultisigUnlockTx",
  }),
  multisigUnlock: [
    {
      excerpts: [
        {
          source: "multisig",
          from: "export const buildMultisigUnlockTx",
          until: "export const twoSignerScript",
        },
        {
          source: "flowController",
          from: "  private importUnsigned",
          until: "  private importWitness",
        },
      ],
    },
    {
      excerpts: [
        sign,
        {
          source: "flowController",
          from: "  private importWitness",
          until: "  private async build",
        },
      ],
    },
    { excerpts: [attach] },
    { excerpts: [submit] },
    { excerpts: [confirm] },
  ],
  eacMint: standardSteps({
    source: "eac",
    from: "export const buildEacMintTx",
    until: "export const buildEacRetirementTx",
  }),
  eacRetire: standardSteps({
    source: "eac",
    from: "export const buildEacRetirementTx",
    until: "export const eacRetirementIndexedAmountError",
  }),
  mint: standardSteps({
    source: "mint",
    from: "export const buildMintTx",
    until: "export const cip25TokenMetadata",
  }),
}

export const extractCodeExcerpt = (
  sources: StepCodeSources,
  definition: StepCodeExcerptDefinition,
): ExtractedCodeExcerpt => {
  const source = sources[definition.source]
  const start = source.indexOf(definition.from)
  if (start < 0) throw new Error(`Step code marker not found: ${definition.source}:${definition.from}`)

  const end = definition.until ? source.indexOf(definition.until, start + definition.from.length) : source.length
  if (end < 0) throw new Error(`Step code end marker not found: ${definition.source}:${definition.until}`)

  const code = source.slice(start, end).trimEnd()
  const startLine = source.slice(0, start).split("\n").length
  return {
    path: stepCodeSourcePaths[definition.source],
    code,
    startLine,
    endLine: startLine + code.split("\n").length - 1,
  }
}

type FlowZoneKind = "inputs" | "steps" | "current" | "outputs" | "confirmation"

type FlowZoneDefinition = {
  kind: FlowZoneKind
  first: string
  last: string
}

type ExerciseLayoutDefinition = {
  id: string
  root: string
  headingLevel: 3 | 4
  zones: ReadonlyArray<FlowZoneDefinition>
}

const standardZones = (prefix: string): ReadonlyArray<FlowZoneDefinition> => [
  { kind: "inputs", first: ":scope > .form-grid", last: ":scope > .form-grid" },
  { kind: "steps", first: ":scope > .pipeline", last: ":scope > .pipeline" },
  { kind: "current", first: `:scope > #${prefix}Status`, last: ":scope > .actions" },
  { kind: "outputs", first: ":scope > .artifact-grid", last: ":scope > .artifact-grid" },
  { kind: "confirmation", first: ":scope > .submit-review", last: ":scope > .recovery-actions" },
]

export const exerciseLayoutDefinitions: ReadonlyArray<ExerciseLayoutDefinition> = [
  { id: "payment", root: "#paymentPanel", headingLevel: 3, zones: standardZones("payment") },
  { id: "metadata", root: "#metadataPanel", headingLevel: 3, zones: standardZones("metadata") },
  {
    id: "multisigSetup",
    root: "#multisigSetupPanel",
    headingLevel: 4,
    zones: [
      { kind: "inputs", first: ":scope > .form-grid", last: ":scope > .form-grid" },
      { kind: "current", first: ":scope > .actions", last: ":scope > #multisigSetupAlert" },
      { kind: "outputs", first: ":scope > .artifact-grid", last: ":scope > .artifact-grid" },
      { kind: "confirmation", first: ":scope > .setup-acknowledgement", last: ":scope > .utxo-choices" },
    ],
  },
  { id: "multisigLock", root: "#multisigLockPanel", headingLevel: 4, zones: standardZones("multisigLock") },
  {
    id: "multisigUnlock",
    root: "#multisigUnlockPanel",
    headingLevel: 4,
    zones: [
      { kind: "inputs", first: ":scope > .handoff-list", last: ":scope > .form-grid" },
      { kind: "steps", first: ":scope > .pipeline", last: ":scope > .pipeline" },
      { kind: "current", first: ":scope > #multisigUnlockStatus", last: ":scope > .actions" },
      { kind: "outputs", first: ":scope > .artifact-grid", last: ":scope > .artifact-grid" },
      { kind: "confirmation", first: ":scope > .submit-review", last: ":scope > .recovery-actions" },
    ],
  },
  {
    id: "eacMint",
    root: "#eacMintPanel",
    headingLevel: 3,
    zones: [
      { kind: "inputs", first: ":scope > .mint-spec", last: ":scope > .form-grid" },
      ...standardZones("eacMint").slice(1),
    ],
  },
  {
    id: "eacRetire",
    root: "#eacRetirePanel",
    headingLevel: 4,
    zones: [
      { kind: "inputs", first: ":scope > .mint-spec", last: ":scope > .form-grid" },
      ...standardZones("eacRetire").slice(1),
    ],
  },
  { id: "mint", root: "#mintPanel", headingLevel: 3, zones: standardZones("mint") },
]

const zonePresentation: Record<FlowZoneKind, { index: string; key: string; fallback: string }> = {
  inputs: { index: "01", key: "layout.zone.inputs", fallback: "Entradas" },
  steps: { index: "02", key: "layout.zone.steps", fallback: "Etapas" },
  current: { index: "03", key: "layout.zone.current", fallback: "Ação atual" },
  outputs: { index: "04", key: "layout.zone.outputs", fallback: "Outputs" },
  confirmation: { index: "05", key: "layout.zone.confirmation", fallback: "Confirmação final" },
}

export const contractIconKeys = [
  "common.objective",
  "common.completedWhen",
  "common.submissionEffect",
  "common.risk",
  "common.limit",
] as const

type ContractIconKey = typeof contractIconKeys[number]

const contractIconMarkup: Record<ContractIconKey, string> = {
  "common.objective": '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  "common.completedWhen": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>',
  "common.submissionEffect": '<path d="M4 5h8v14H4zM9 12h11m-4-4 4 4-4 4"/>',
  "common.risk": '<path d="m12 3 9 17H3L12 3Z"/><path d="M12 9v4m0 3h.01"/>',
  "common.limit": '<path d="M8 4H5v16h3M16 4h3v16h-3M9 12h6"/>',
}

export const hydrateExerciseLayouts = (document: Document = globalThis.document) => {
  hydrateContractIcons(document)
  for (const definition of exerciseLayoutDefinitions) {
    const root = document.querySelector<HTMLElement>(definition.root)
    if (!root || root.querySelector(":scope > .flow-zone")) continue
    for (const zone of definition.zones) createZone(root, definition, zone)
  }
}

const hydrateContractIcons = (document: Document) => {
  document.querySelectorAll<HTMLElement>(".exercise-contract > div > span[data-i18n]").forEach((label) => {
    const key = label.dataset.i18n
    if (!contractIconKeys.includes(key as ContractIconKey)) return
    const container = label.parentElement
    if (!container || container.querySelector(":scope > .contract-icon")) return

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    icon.classList.add("contract-icon")
    icon.setAttribute("viewBox", "0 0 24 24")
    icon.setAttribute("aria-hidden", "true")
    icon.setAttribute("focusable", "false")
    icon.innerHTML = contractIconMarkup[key as ContractIconKey]
    container.dataset.contractKind = key?.slice("common.".length)
    label.before(icon)
  })
}

const createZone = (
  root: HTMLElement,
  definition: ExerciseLayoutDefinition,
  zone: FlowZoneDefinition,
) => {
  const first = root.querySelector<HTMLElement>(zone.first)
  const last = root.querySelector<HTMLElement>(zone.last)
  if (!first || !last || first.parentElement !== root || last.parentElement !== root) {
    throw new Error(`Cannot create ${zone.kind} zone for ${definition.id}`)
  }

  const nodes = elementsFrom(first, last)
  const section = root.ownerDocument.createElement("section")
  const titleId = `${definition.id}-${zone.kind}-title`
  section.className = `flow-zone flow-zone-${zone.kind}`
  section.dataset.flowZone = zone.kind
  section.setAttribute("aria-labelledby", titleId)

  const heading = root.ownerDocument.createElement("header")
  heading.className = "flow-zone-heading"
  const index = root.ownerDocument.createElement("span")
  index.className = "flow-zone-index"
  index.setAttribute("aria-hidden", "true")
  index.textContent = zonePresentation[zone.kind].index
  const title = root.ownerDocument.createElement(`h${definition.headingLevel}`)
  title.id = titleId
  title.dataset.i18n = zonePresentation[zone.kind].key
  title.textContent = zonePresentation[zone.kind].fallback
  heading.append(index, title)

  const body = root.ownerDocument.createElement("div")
  body.className = "flow-zone-body"
  section.append(heading, body)
  root.insertBefore(section, first)
  body.append(...nodes)
  if (zone.kind === "current") normalizeCurrentZone(body)
}

const elementsFrom = (first: HTMLElement, last: HTMLElement): Array<HTMLElement> => {
  const elements: Array<HTMLElement> = []
  let current: Element | null = first
  while (current) {
    if (!(current instanceof HTMLElement)) throw new Error("Flow zone contains a non-HTML element")
    elements.push(current)
    if (current === last) return elements
    current = current.nextElementSibling
  }
  throw new Error("Flow zone end is not reachable from its start")
}

const normalizeCurrentZone = (body: HTMLElement) => {
  const status = body.querySelector<HTMLElement>(":scope > .flow-status")
  const alert = body.querySelector<HTMLElement>(":scope > .flow-alert")
  if (status) body.prepend(status)
  if (status && alert) status.after(alert)
}

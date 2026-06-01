import { Transaction } from "@evolution-sdk/evolution"

export type TxBuildResponse = {
  txCbor: string
  details: Record<string, unknown>
}

export type SubmitWorkbench = {
  name: string
  signed: HTMLTextAreaElement
  txHash: HTMLTextAreaElement
}

export type TxWorkbench = SubmitWorkbench & {
  details: HTMLTextAreaElement
  unsigned: HTMLTextAreaElement
  witness: HTMLTextAreaElement
  setBuild(result: TxBuildResponse): void
}

export type MultisigWorkbench = SubmitWorkbench & {
  details: HTMLTextAreaElement
  unsigned: HTMLTextAreaElement
  witnessA: HTMLTextAreaElement
  witnessB: HTMLTextAreaElement
  setBuild(result: TxBuildResponse): void
}

export function hydrateArtifactBoxes() {
  const template = document.querySelector<HTMLTemplateElement>("#artifactTemplate")

  document.querySelectorAll<HTMLElement>("artifact-box").forEach((placeholder) => {
    const target = placeholder.getAttribute("target")!
    const title = placeholder.getAttribute("title")!
    const node = template?.content.firstElementChild?.cloneNode(true) as HTMLElement

    node.querySelector("strong")!.textContent = title
    node.querySelector("textarea")!.id = target
    node.querySelector("button")!.setAttribute("data-copy-target", target)
    placeholder.replaceWith(node)
  })
}

export function txWorkbench(name: string): TxWorkbench {
  return {
    name,
    details: select(`#${name}Details`),
    unsigned: select(`#${name}Unsigned`),
    witness: select(`#${name}Witness`),
    signed: select(`#${name}Signed`),
    txHash: select(`#${name}TxHash`),
    setBuild(result) {
      this.details.value = renderJson(result.details)
      this.unsigned.value = result.txCbor
      this.witness.value = ""
      this.signed.value = ""
      this.txHash.value = ""
    },
  }
}

export function multisigWorkbench(name: string): MultisigWorkbench {
  return {
    name,
    details: select(`#${name}Details`),
    unsigned: select(`#${name}Unsigned`),
    witnessA: select(`#${name}WitnessA`),
    witnessB: select(`#${name}WitnessB`),
    signed: select(`#${name}Signed`),
    txHash: select(`#${name}TxHash`),
    setBuild(result) {
      this.details.value = renderJson(result.details)
      this.unsigned.value = result.txCbor
      this.witnessA.value = ""
      this.witnessB.value = ""
      this.signed.value = ""
      this.txHash.value = ""
    },
  }
}

export function mergeWitnesses(unsignedTxCbor: string, witnessSets: ReadonlyArray<string>) {
  const cleanUnsigned = requireCbor(unsignedTxCbor, "unsigned tx CBOR")
  const cleanWitnesses = witnessSets.map((witness) => witness.trim()).filter(Boolean)
  if (cleanWitnesses.length === 0) throw new Error("Nenhum witness set informado")

  return cleanWitnesses.reduce((tx, witness) => Transaction.addVKeyWitnessesHex(tx, witness), cleanUnsigned)
}

export async function copyArtifact(targetId: string) {
  const value = select<HTMLTextAreaElement>(`#${targetId}`).value
  await navigator.clipboard.writeText(value)
}

export function inputValue(selector: string): string {
  return select<HTMLInputElement>(selector).value.trim()
}

export function select<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Elemento não encontrado: ${selector}`)
  return element
}

export function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function requireCbor(value: string, label: string): string {
  const clean = value.trim().replace(/^0x/, "")
  if (!clean) throw new Error(`Informe ${label}`)
  return clean
}

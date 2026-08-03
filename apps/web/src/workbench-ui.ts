import {
  KeyHash,
  Transaction,
  TransactionBody,
  TransactionHash,
  TransactionWitnessSet,
  VKey,
} from "@evolution-sdk/evolution"

export type TxBuildResponse = {
  txCbor: string
  details: Record<string, unknown>
}

export type TxStatusResponse =
  | { status: "not-indexed" }
  | {
      status: "included"
      block: string
      blockHeight: number
      blockTime: number
    }

export const hydrateArtifactBoxes = () => {
  const template = select<HTMLTemplateElement>("#artifactTemplate")

  document.querySelectorAll<HTMLElement>("artifact-box").forEach((placeholder) => {
    const target = requireAttribute(placeholder, "target")
    const title = requireAttribute(placeholder, "title")
    const description = placeholder.getAttribute("description") ?? "Artefato técnico desta etapa."
    const editable = placeholder.hasAttribute("editable")
    const node = template.content.firstElementChild?.cloneNode(true) as HTMLElement
    const textarea = selectWithin<HTMLTextAreaElement>(node, "textarea")
    const copyButton = selectWithin<HTMLButtonElement>(node, ".copy-button")
    const titleElement = selectWithin<HTMLElement>(node, ".artifact-title")
    const descriptionElement = selectWithin<HTMLElement>(node, ".artifact-description")

    titleElement.textContent = title
    titleElement.id = `${target}Label`
    descriptionElement.textContent = description
    textarea.id = target
    textarea.readOnly = !editable
    textarea.setAttribute("aria-labelledby", titleElement.id)
    copyButton.dataset.copyTarget = target
    copyButton.setAttribute("aria-label", `Copiar ${title}`)
    copyButton.addEventListener("click", (event) => event.stopPropagation())
    placeholder.replaceWith(node)
  })
}

export const mergeWitnesses = (
  unsignedTxCbor: string,
  witnessSets: ReadonlyArray<string>,
  expectedSignerHashes?: ReadonlyArray<string>,
): string => {
  const cleanUnsigned = requireCbor(unsignedTxCbor, "unsigned tx CBOR")
  const cleanWitnesses = witnessSets.map((witness) => witness.trim()).filter(Boolean)
  if (cleanWitnesses.length === 0) throw new Error("Nenhum witness set informado")

  const transaction = Transaction.fromCBORHex(cleanUnsigned)
  const bodyHash = TransactionBody.toHash(transaction.body).hash
  const signerHashes = new Set<string>()

  for (const witnessCbor of cleanWitnesses) {
    const witnessSet = TransactionWitnessSet.fromCBORHex(requireCbor(witnessCbor, "witness set CBOR"))
    const vkeyWitnesses = witnessSet.vkeyWitnesses ?? []
    if (vkeyWitnesses.length === 0) throw new Error("O witness set não contém assinatura de chave")

    for (const witness of vkeyWitnesses) {
      const signerHash = KeyHash.toHex(KeyHash.fromVKey(witness.vkey))
      if (signerHashes.has(signerHash)) throw new Error(`Assinatura duplicada para o signer ${signerHash}`)
      if (!VKey.verify(witness.vkey, bodyHash, witness.signature.bytes)) {
        throw new Error(`Assinatura inválida para o signer ${signerHash}`)
      }
      signerHashes.add(signerHash)
    }
  }

  const bodyRequiredSigners = (transaction.body.requiredSigners ?? []).map((keyHash) =>
    KeyHash.toHex(keyHash).toLowerCase())
  if (
    expectedSignerHashes &&
    bodyRequiredSigners.length > 0 &&
    !sameSet(bodyRequiredSigners, expectedSignerHashes.map((hash) => hash.toLowerCase()))
  ) {
    throw new Error("Os required signers do CBOR não correspondem ao fluxo revisado")
  }

  const requiredSigners = expectedSignerHashes?.map((hash) => hash.toLowerCase()) ?? bodyRequiredSigners
  if (requiredSigners.length > 0) {
    const expected = new Set(requiredSigners)
    const missing = [...expected].filter((hash) => !signerHashes.has(hash))
    const unexpected = [...signerHashes].filter((hash) => !expected.has(hash))
    if (missing.length > 0) throw new Error(`Faltam assinaturas dos signers: ${missing.join(", ")}`)
    if (unexpected.length > 0) throw new Error(`Witness de signer inesperado: ${unexpected.join(", ")}`)
  }

  return cleanWitnesses.reduce(
    (tx, witness) => Transaction.addVKeyWitnessesHex(tx, witness),
    cleanUnsigned,
  )
}

export const transactionHashFromCbor = (transactionCbor: string): string => {
  const transaction = Transaction.fromCBORHex(requireCbor(transactionCbor, "transaction CBOR"))
  return TransactionHash.toHex(TransactionBody.toHash(transaction.body))
}

export const copyArtifact = async (targetId: string) => {
  const value = select<HTMLTextAreaElement>(`#${targetId}`).value.trim()
  if (!value) throw new Error("Este artefato ainda está vazio")
  await navigator.clipboard.writeText(value)
}

export const inputValue = (selector: string): string =>
  select<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector).value.trim()

export const select = <T extends Element = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Elemento não encontrado: ${selector}`)
  return element
}

export const selectWithin = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T => {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Elemento não encontrado: ${selector}`)
  return element
}

export const renderJson = (value: unknown): string => JSON.stringify(value, null, 2)

export const parseDetails = (value: string): Record<string, unknown> | undefined => {
  if (!value.trim()) return undefined
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

export const setVisible = (element: HTMLElement, visible: boolean) => {
  element.hidden = !visible
}

const requireAttribute = (element: Element, name: string): string => {
  const value = element.getAttribute(name)
  if (value) return value
  throw new Error(`Atributo obrigatório ausente: ${name}`)
}

const requireCbor = (value: string, label: string): string => {
  const clean = value.trim().replace(/^0x/, "")
  if (!clean) throw new Error(`Informe ${label}`)
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) throw new Error(`${label} não é hexadecimal válido`)
  return clean
}

const sameSet = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value) => right.includes(value))

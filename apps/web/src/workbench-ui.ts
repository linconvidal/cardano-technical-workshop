import {
  KeyHash,
  Transaction,
  TransactionBody,
  TransactionHash,
  TransactionWitnessSet,
  VKey,
} from "@evolution-sdk/evolution"
import {
  formatMessage,
  messageRef,
  type Locale,
  type MessageKey,
} from "../../../packages/localization/src/index.js"
import { MessageError } from "./flow-errors.js"

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

export const hydrateArtifactBoxes = (locale: Locale = "pt-BR") => {
  const template = select<HTMLTemplateElement>("#artifactTemplate")

  document.querySelectorAll<HTMLElement>("artifact-box").forEach((placeholder) => {
    const target = requireAttribute(placeholder, "target")
    const references = declaredArtifactReferences(placeholder) ?? artifactReferences(target)
    const editable = placeholder.hasAttribute("editable")
    const node = template.content.firstElementChild?.cloneNode(true) as HTMLElement
    const textarea = selectWithin<HTMLTextAreaElement>(node, "textarea")
    const copyButton = selectWithin<HTMLButtonElement>(node, ".copy-button")
    const titleElement = selectWithin<HTMLElement>(node, ".artifact-title")
    const descriptionElement = selectWithin<HTMLElement>(node, ".artifact-description")

    titleElement.dataset.i18n = references.title
    descriptionElement.dataset.i18n = references.description
    titleElement.textContent = formatMessage(messageRef(references.title), locale)
    titleElement.id = `${target}Label`
    descriptionElement.textContent = formatMessage(messageRef(references.description), locale)
    textarea.id = target
    textarea.readOnly = !editable
    textarea.setAttribute("aria-labelledby", titleElement.id)
    copyButton.dataset.copyTarget = target
    copyButton.dataset.artifactTitleKey = references.title
    copyButton.setAttribute("aria-label", formatMessage(messageRef("artifact.copyLabel", {
      title: titleElement.textContent,
    }), locale))
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
  if (cleanWitnesses.length === 0) throw new Error("witness_set_missing")

  const transaction = Transaction.fromCBORHex(cleanUnsigned)
  const bodyHash = TransactionBody.toHash(transaction.body).hash
  const signerHashes = new Set<string>()

  for (const witnessCbor of cleanWitnesses) {
    const witnessSet = TransactionWitnessSet.fromCBORHex(requireCbor(witnessCbor, "witness set CBOR"))
    const vkeyWitnesses = witnessSet.vkeyWitnesses ?? []
    if (vkeyWitnesses.length === 0) throw new Error("witness_set_missing_vkey_signature")

    for (const witness of vkeyWitnesses) {
      const signerHash = KeyHash.toHex(KeyHash.fromVKey(witness.vkey))
      if (signerHashes.has(signerHash)) throw new Error(`duplicate_signer_witness: ${signerHash}`)
      if (!VKey.verify(witness.vkey, bodyHash, witness.signature.bytes)) {
        throw new Error(`invalid_signer_signature: ${signerHash}`)
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
    throw new Error("required_signers_mismatch")
  }

  const requiredSigners = expectedSignerHashes?.map((hash) => hash.toLowerCase()) ?? bodyRequiredSigners
  if (requiredSigners.length > 0) {
    const expected = new Set(requiredSigners)
    const missing = [...expected].filter((hash) => !signerHashes.has(hash))
    const unexpected = [...signerHashes].filter((hash) => !expected.has(hash))
    if (missing.length > 0) throw new Error(`missing_signer_witnesses: ${missing.join(", ")}`)
    if (unexpected.length > 0) throw new Error(`unexpected_signer_witness: ${unexpected.join(", ")}`)
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
  if (!value) throw new MessageError("artifact_empty", messageRef("clipboard.error.empty"))
  await navigator.clipboard.writeText(value)
}

export const rerenderArtifactBoxes = (locale: Locale) => {
  document.querySelectorAll<HTMLElement>(".artifact-title[data-i18n]").forEach((title) => {
    const key = title.dataset.i18n as MessageKey
    title.textContent = formatMessage(messageRef(key), locale)
  })
  document.querySelectorAll<HTMLElement>(".artifact-description[data-i18n]").forEach((description) => {
    const key = description.dataset.i18n as MessageKey
    description.textContent = formatMessage(messageRef(key), locale)
  })
  document.querySelectorAll<HTMLButtonElement>(".copy-button[data-artifact-title-key]").forEach((button) => {
    const title = formatMessage(messageRef(button.dataset.artifactTitleKey as MessageKey), locale)
    button.setAttribute("aria-label", formatMessage(messageRef("artifact.copyLabel", { title }), locale))
  })
}

export const inputValue = (selector: string): string =>
  select<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector).value.trim()

export const select = <T extends Element = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`element_not_found: ${selector}`)
  return element
}

export const selectWithin = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T => {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`element_not_found: ${selector}`)
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
  throw new Error(`required_attribute_missing: ${name}`)
}

const artifactReferences = (target: string): { title: MessageKey; description: MessageKey } => {
  const special = artifactSpecialReferences[target]
  if (special) return special
  if (target.endsWith("Details")) return artifactPair("details")
  if (target.includes("Unsigned")) return artifactPair("unsigned")
  if (target.includes("Witness")) return artifactPair("witness")
  if (target.includes("Signed")) return artifactPair("signed")
  if (target.includes("TxHash")) return artifactPair("hash")
  return { title: "artifact.title.details", description: "artifact.description.generic" }
}

const declaredArtifactReferences = (
  placeholder: HTMLElement,
): { title: MessageKey; description: MessageKey } | undefined => {
  const declaration = placeholder.dataset.i18nAttr ?? placeholder.dataset.i18nAttributes
  if (!declaration) return undefined
  const mappings = Object.fromEntries(declaration.split(/[;,]/).map((entry) => {
    const [attribute, key] = entry.split(":").map((part) => part.trim())
    return [attribute, key]
  }))
  if (!mappings.title || !mappings.description) return undefined
  return {
    title: mappings.title as MessageKey,
    description: mappings.description as MessageKey,
  }
}

const artifactPair = (name: "details" | "unsigned" | "witness" | "signed" | "hash") => ({
  title: `artifact.title.${name}` as MessageKey,
  description: `artifact.description.${name}` as MessageKey,
})

const artifactSpecialReferences: Readonly<Record<string, { title: MessageKey; description: MessageKey }>> = {
  multisigDetails: {
    title: "artifact.title.multisigDetails",
    description: "artifact.description.multisigDetails",
  },
  multisigUtxos: {
    title: "artifact.title.multisigUtxos",
    description: "artifact.description.multisigUtxos",
  },
  multisigLockDetails: {
    title: "artifact.title.lockDetails",
    description: "artifact.description.lockDetails",
  },
  multisigUnlockDetails: {
    title: "artifact.title.unlockDetails",
    description: "artifact.description.unlockDetails",
  },
  multisigUnlockWitnessA: {
    title: "artifact.title.currentWitness",
    description: "artifact.description.currentWitness",
  },
  multisigUnlockWitnessB: {
    title: "artifact.title.receivedWitness",
    description: "artifact.description.receivedWitness",
  },
  eacMintDetails: {
    title: "artifact.title.eacDetails",
    description: "artifact.description.eacDetails",
  },
  eacRetireDetails: {
    title: "artifact.title.retireDetails",
    description: "artifact.description.retireDetails",
  },
  mintDetails: {
    title: "artifact.title.mintDetails",
    description: "artifact.description.mintDetails",
  },
}

const requireCbor = (value: string, label: string): string => {
  const clean = value.trim().replace(/^0x/, "")
  if (!clean) throw new Error(`cbor_required: ${label}`)
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) throw new Error(`invalid_cbor_hex: ${label}`)
  return clean
}

const sameSet = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value) => right.includes(value))

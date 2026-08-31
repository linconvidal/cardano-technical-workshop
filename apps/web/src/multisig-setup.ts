import {
  formatMessage,
  messageRef,
  type Locale,
  type MessageRef,
} from "../../../packages/localization/src/index.js"
import { HttpError, postJson } from "./http.js"
import { inputValue, renderJson, select, setArtifactValue, setVisible } from "./workbench-ui.js"
import type { WorkbenchLogger } from "./technical-log.js"
import type { WalletSession } from "./wallet.js"

export type ScriptUtxo = {
  outRef: string
  lovelace: string
  assets: unknown
}

type ScriptUtxosResponse = {
  scriptAddress: string
  scriptUtxos: ReadonlyArray<ScriptUtxo>
}

type MultisigSetupConfig = {
  wallet: () => WalletSession | undefined
  onInputChange: () => void
  onSetupChange: () => void
  log: WorkbenchLogger
  locale: () => Locale
}

export type AlertContent = {
  message: MessageRef
  guidance: MessageRef
  technicalDetail: string
}

export const multisigAlertContent = (error: unknown): AlertContent => {
  if (error instanceof HttpError) {
    return {
      message: error.problem.messageRef ?? messageRef("multisig.error.generic"),
      guidance: error.problem.guidanceRef ?? messageRef("multisig.guidance.generic"),
      technicalDetail: error.problem.technicalDetail ?? "",
    }
  }

  return {
    message: messageRef("multisig.error.generic"),
    guidance: messageRef("multisig.guidance.generic"),
    technicalDetail: error instanceof Error ? error.message : String(error),
  }
}

export class MultisigSetupController {
  private readonly root = select<HTMLElement>("#multisigSetupPanel")
  private readonly describeButton = select<HTMLButtonElement>("#multisigDescribe")
  private readonly listButton = select<HTMLButtonElement>("#multisigListUtxos")
  private readonly acknowledgement = select<HTMLInputElement>("#multisigSetupAcknowledge")
  private readonly status = select<HTMLElement>("#multisigSetupStatus")
  private readonly alert = select<HTMLElement>("#multisigSetupAlert")
  private readonly details = select<HTMLTextAreaElement>("#multisigDetails")
  private readonly utxos = select<HTMLTextAreaElement>("#multisigUtxos")
  private readonly choices = select<HTMLFieldSetElement>("#multisigUtxoChoices")
  private readonly choicesContainer = select<HTMLElement>("#multisigUtxoChoices > div")
  private generation = 0
  private busy = false
  private reviewedFingerprint?: string
  private listedFingerprint?: string
  private availableOutRefs = new Set<string>()
  private statusRef: MessageRef = messageRef("multisig.status.initial")
  private alertContent?: AlertContent
  private currentUtxos: ReadonlyArray<ScriptUtxo> = []

  constructor(private readonly config: MultisigSetupConfig) {
    this.describeButton.addEventListener("click", () => { void this.describe() })
    this.listButton.addEventListener("click", () => { void this.listUtxos() })
    this.acknowledgement.addEventListener("change", () => this.config.onSetupChange())
    this.renderLocalizedContent()
  }

  isBusy(): boolean {
    return this.busy
  }

  isReadyForLock(): boolean {
    return Boolean(
      this.reviewedFingerprint &&
      this.reviewedFingerprint === this.signerFingerprint() &&
      this.acknowledgement.checked,
    )
  }

  isReadyForUnlockBuild(): boolean {
    const selectedOutRef = select<HTMLInputElement>("#multisigScriptUtxo").value
    return this.isReadyForLock() &&
      this.listedFingerprint === this.signerFingerprint() &&
      this.availableOutRefs.has(selectedOutRef)
  }

  invalidate(reason: MessageRef) {
    this.generation += 1
    this.busy = false
    this.root.setAttribute("aria-busy", "false")
    this.describeButton.removeAttribute("aria-busy")
    this.listButton.removeAttribute("aria-busy")
    this.reviewedFingerprint = undefined
    this.listedFingerprint = undefined
    this.availableOutRefs.clear()
    this.currentUtxos = []
    setArtifactValue(this.details, "")
    setArtifactValue(this.utxos, "")
    this.clearSelectedOutRef()
    this.choicesContainer.replaceChildren()
    setVisible(this.choices, false)
    this.alertContent = undefined
    setVisible(this.alert, false)
    this.acknowledgement.checked = false
    this.acknowledgement.disabled = true
    this.statusRef = reason
    this.renderLocalizedContent()
    this.refreshReadiness()
    this.config.onSetupChange()
  }

  refreshReadiness() {
    const ready = Boolean(this.config.wallet()) && Boolean(inputValue("#multisigSecondSigner"))
    this.describeButton.disabled = this.busy || !ready
    this.listButton.disabled = this.busy || !ready || this.reviewedFingerprint !== this.signerFingerprint()
  }

  rerenderForLocale() {
    this.renderLocalizedContent()
    this.renderChoices(this.currentUtxos, false)
  }

  private async describe() {
    await this.run(this.describeButton, messageRef("multisig.status.generating"), async (generation) => {
      this.clearSelectedOutRef()
      this.availableOutRefs.clear()
      this.listedFingerprint = undefined
      this.currentUtxos = []
      setArtifactValue(this.utxos, "")
      this.choicesContainer.replaceChildren()
      setVisible(this.choices, false)
      const result = await postJson<Record<string, unknown>>(
        "/api/workshop/03-multisig/describe",
        this.payload(),
      )
      if (generation !== this.generation) return

      setArtifactValue(this.details, renderJson(result))
      this.reviewedFingerprint = this.signerFingerprint()
      this.acknowledgement.checked = false
      this.acknowledgement.disabled = false
      this.setStatus(messageRef("multisig.status.generated"))
      this.config.log(messageRef("multisig.log.generated"))
      this.config.onSetupChange()
    })
  }

  private async listUtxos() {
    await this.run(this.listButton, messageRef("multisig.status.listing"), async (generation) => {
      const result = await postJson<ScriptUtxosResponse>(
        "/api/workshop/03-multisig/utxos",
        this.payload(),
      )
      if (generation !== this.generation) return

      setArtifactValue(this.utxos, renderJson(result))
      this.currentUtxos = result.scriptUtxos
      this.renderChoices(result.scriptUtxos)

      if (result.scriptUtxos.length === 0) {
        this.setStatus(messageRef("multisig.status.none"))
        return
      }
      if (result.scriptUtxos.length === 1) {
        this.selectOutRef(result.scriptUtxos[0].outRef)
        this.setStatus(messageRef("multisig.status.one", { outRef: result.scriptUtxos[0].outRef }))
        return
      }
      this.setStatus(messageRef("multisig.status.many"))
    })
  }

  private payload() {
    const wallet = this.config.wallet()
    if (!wallet) throw new Error("wallet_required_for_multisig_setup")
    return {
      userAddress: wallet.address,
      secondSignerAddress: inputValue("#multisigSecondSigner"),
    }
  }

  private signerFingerprint(): string {
    return `${this.config.wallet()?.address ?? ""}|${inputValue("#multisigSecondSigner")}`
  }

  private renderChoices(scriptUtxos: ReadonlyArray<ScriptUtxo>, resetSelection = true) {
    const selected = select<HTMLInputElement>("#multisigScriptUtxo").value
    if (resetSelection) this.clearSelectedOutRef()
    this.availableOutRefs = new Set(scriptUtxos.map((utxo) => utxo.outRef))
    if (resetSelection) this.listedFingerprint = this.signerFingerprint()
    this.choicesContainer.replaceChildren()
    setVisible(this.choices, scriptUtxos.length > 0)

    for (const utxo of scriptUtxos) {
      const label = document.createElement("label")
      const radio = document.createElement("input")
      const text = document.createElement("span")
      radio.type = "radio"
      radio.name = "multisigUtxoChoice"
      radio.value = utxo.outRef
      radio.checked = !resetSelection && selected === utxo.outRef
      radio.addEventListener("change", () => this.selectOutRef(utxo.outRef))
      text.textContent = formatMessage(messageRef("multisig.choice.label", {
        outRef: utxo.outRef,
        lovelace: utxo.lovelace,
      }), this.config.locale())
      label.append(radio, text)
      this.choicesContainer.append(label)
    }
  }

  private clearSelectedOutRef() {
    const input = select<HTMLInputElement>("#multisigScriptUtxo")
    if (!input.value) return
    input.value = ""
    input.dispatchEvent(new Event("input", { bubbles: true }))
    this.config.onInputChange()
  }

  private selectOutRef(outRef: string) {
    const input = select<HTMLInputElement>("#multisigScriptUtxo")
    input.value = outRef
    input.dispatchEvent(new Event("input", { bubbles: true }))
    this.config.onInputChange()
  }

  private async run(
    button: HTMLButtonElement,
    pending: MessageRef,
    action: (generation: number) => Promise<void>,
  ) {
    const otherBusyOperation = document.querySelector<HTMLElement>('[data-stage][aria-busy="true"]')
    if (otherBusyOperation && otherBusyOperation !== this.root) {
      this.setStatus(messageRef("multisig.status.waitCurrent"))
      return
    }

    const generation = ++this.generation
    this.busy = true
    this.root.setAttribute("aria-busy", "true")
    this.refreshReadiness()
    button.setAttribute("aria-busy", "true")
    this.setStatus(pending)
    this.alertContent = undefined
    setVisible(this.alert, false)
    this.config.onSetupChange()

    try {
      await action(generation)
    } catch (error) {
      if (generation !== this.generation) return
      this.alertContent = multisigAlertContent(error)
      this.renderAlert()
      setVisible(this.alert, true)
      this.alert.focus()
      this.setStatus(messageRef("multisig.status.recover"))
      this.config.log(
        this.alertContent.message,
        "error",
        this.alertContent.technicalDetail || undefined,
      )
    } finally {
      if (generation !== this.generation) return
      this.busy = false
      this.root.setAttribute("aria-busy", "false")
      button.removeAttribute("aria-busy")
      this.refreshReadiness()
      this.config.onSetupChange()
    }
  }

  private setStatus(reference: MessageRef) {
    this.statusRef = reference
    this.status.textContent = formatMessage(reference, this.config.locale())
  }

  private renderLocalizedContent() {
    this.status.textContent = formatMessage(this.statusRef, this.config.locale())
    this.renderAlert()
  }

  private renderAlert() {
    if (!this.alertContent) return
    const locale = this.config.locale()
    this.alert.querySelector("strong")!.textContent = formatMessage(this.alertContent.message, locale)
    this.alert.querySelector("p")!.textContent = formatMessage(this.alertContent.guidance, locale)
    this.alert.querySelector("pre")!.textContent = this.alertContent.technicalDetail
  }
}

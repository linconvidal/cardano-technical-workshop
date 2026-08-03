import { HttpError, postJson } from "./http.js"
import { inputValue, renderJson, select, setVisible } from "./workbench-ui.js"
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

  constructor(private readonly config: MultisigSetupConfig) {
    this.describeButton.addEventListener("click", () => { void this.describe() })
    this.listButton.addEventListener("click", () => { void this.listUtxos() })
    this.acknowledgement.addEventListener("change", () => this.config.onSetupChange())
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

  invalidate(reason: string) {
    this.generation += 1
    this.busy = false
    this.root.setAttribute("aria-busy", "false")
    this.describeButton.removeAttribute("aria-busy")
    this.listButton.removeAttribute("aria-busy")
    this.reviewedFingerprint = undefined
    this.listedFingerprint = undefined
    this.availableOutRefs.clear()
    this.details.value = ""
    this.utxos.value = ""
    this.clearSelectedOutRef()
    this.choicesContainer.replaceChildren()
    setVisible(this.choices, false)
    setVisible(this.alert, false)
    this.acknowledgement.checked = false
    this.acknowledgement.disabled = true
    this.status.textContent = reason
    this.refreshReadiness()
    this.config.onSetupChange()
  }

  refreshReadiness() {
    const ready = Boolean(this.config.wallet()) && Boolean(inputValue("#multisigSecondSigner"))
    this.describeButton.disabled = this.busy || !ready
    this.listButton.disabled = this.busy || !ready || this.reviewedFingerprint !== this.signerFingerprint()
  }

  private async describe() {
    await this.run(this.describeButton, "Gerando o script 2-de-2...", async (generation) => {
      this.clearSelectedOutRef()
      this.availableOutRefs.clear()
      this.listedFingerprint = undefined
      this.utxos.value = ""
      this.choicesContainer.replaceChildren()
      setVisible(this.choices, false)
      const result = await postJson<Record<string, unknown>>(
        "/api/workshop/03-multisig/describe",
        this.payload(),
      )
      if (generation !== this.generation) return

      this.details.value = renderJson(result)
      this.reviewedFingerprint = this.signerFingerprint()
      this.acknowledgement.checked = false
      this.acknowledgement.disabled = false
      this.status.textContent = "Script criado. Abra os detalhes e confira endereço e hashes antes de autorizar o lock."
      this.config.log("Multisig: script 2-de-2 gerado com duas chaves distintas.")
      this.config.onSetupChange()
    })
  }

  private async listUtxos() {
    await this.run(this.listButton, "Consultando UTxOs do script na Preprod...", async (generation) => {
      const result = await postJson<ScriptUtxosResponse>(
        "/api/workshop/03-multisig/utxos",
        this.payload(),
      )
      if (generation !== this.generation) return

      this.utxos.value = renderJson(result)
      this.renderChoices(result.scriptUtxos)

      if (result.scriptUtxos.length === 0) {
        this.status.textContent = "Nenhum UTxO indexado ainda. Se o lock foi incluído agora, aguarde alguns segundos e tente novamente."
        return
      }
      if (result.scriptUtxos.length === 1) {
        this.selectOutRef(result.scriptUtxos[0].outRef)
        this.status.textContent = `UTxO único selecionado: ${result.scriptUtxos[0].outRef}`
        return
      }
      this.status.textContent = "Há vários UTxOs. Escolha explicitamente qual deles o unlock deve consumir."
    })
  }

  private payload() {
    const wallet = this.config.wallet()
    if (!wallet) throw new Error("Conecte a wallet do signer A primeiro")
    return {
      userAddress: wallet.address,
      secondSignerAddress: inputValue("#multisigSecondSigner"),
    }
  }

  private signerFingerprint(): string {
    return `${this.config.wallet()?.address ?? ""}|${inputValue("#multisigSecondSigner")}`
  }

  private renderChoices(scriptUtxos: ReadonlyArray<ScriptUtxo>) {
    this.clearSelectedOutRef()
    this.availableOutRefs = new Set(scriptUtxos.map((utxo) => utxo.outRef))
    this.listedFingerprint = this.signerFingerprint()
    this.choicesContainer.replaceChildren()
    setVisible(this.choices, scriptUtxos.length > 0)

    for (const utxo of scriptUtxos) {
      const label = document.createElement("label")
      const radio = document.createElement("input")
      const text = document.createElement("span")
      radio.type = "radio"
      radio.name = "multisigUtxoChoice"
      radio.value = utxo.outRef
      radio.addEventListener("change", () => this.selectOutRef(utxo.outRef))
      text.textContent = `${utxo.outRef} | ${utxo.lovelace} lovelace`
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
    pendingText: string,
    action: (generation: number) => Promise<void>,
  ) {
    const otherBusyOperation = document.querySelector<HTMLElement>('[data-stage][aria-busy="true"]')
    if (otherBusyOperation && otherBusyOperation !== this.root) {
      this.status.textContent = "Aguarde a etapa em andamento antes de iniciar o setup multisig."
      return
    }

    const generation = ++this.generation
    this.busy = true
    this.root.setAttribute("aria-busy", "true")
    this.refreshReadiness()
    button.setAttribute("aria-busy", "true")
    this.status.textContent = pendingText
    setVisible(this.alert, false)
    this.config.onSetupChange()

    try {
      await action(generation)
    } catch (error) {
      if (generation !== this.generation) return
      const message = error instanceof HttpError ? error.problem.message : "Não foi possível concluir a etapa multisig"
      const guidance = error instanceof HttpError
        ? error.problem.guidance
        : "Confira as duas wallets, a rede Preprod e os endereços. Depois, tente novamente."
      this.alert.querySelector("strong")!.textContent = message
      this.alert.querySelector("p")!.textContent = guidance ?? "Tente novamente."
      this.alert.querySelector("pre")!.textContent = error instanceof Error ? error.message : String(error)
      setVisible(this.alert, true)
      this.alert.focus()
      this.status.textContent = "Corrija o problema indicado e repita esta etapa."
      this.config.log(`Multisig: ${message}`, "error")
    } finally {
      if (generation !== this.generation) return
      this.busy = false
      this.root.setAttribute("aria-busy", "false")
      button.removeAttribute("aria-busy")
      this.refreshReadiness()
      this.config.onSetupChange()
    }
  }
}

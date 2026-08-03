import type { WorkbenchFlowControllers } from "./workbench-flows.js"
import type { FlowState } from "./workbench-state.js"
import { parseSession, serializeSession } from "./workbench-session.js"
import { select, setVisible } from "./workbench-ui.js"

const SESSION_KEY = "cardano-technical-workshop.session.v1"

type SessionControllerConfig = {
  flows: WorkbenchFlowControllers
  onRestored: () => void
  isBusy: () => boolean
  log: (message: string) => void
}

export class SessionController {
  private readonly banner = select<HTMLElement>("#resumeBanner")
  private resumeOfferPending = false

  constructor(private readonly config: SessionControllerConfig) {
    select<HTMLButtonElement>("#resumeSession").addEventListener("click", () => this.restore())
    select<HTMLButtonElement>("#discardSession").addEventListener("click", () => this.discard())
  }

  offer() {
    const saved = parseSession(sessionStorage.getItem(SESSION_KEY))
    if (!saved) return

    this.resumeOfferPending = true
    const savedAt = new Date(saved.savedAt).toLocaleString("pt-BR")
    select<HTMLElement>("#resumeDescription").textContent = `Salva nesta aba em ${savedAt}. A wallet e o setup multisig deverão ser validados novamente.`
    setVisible(this.banner, true)
  }

  save() {
    if (this.resumeOfferPending) return
    const inputs = Object.fromEntries(
      [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("[data-session-input]")]
        .map((input) => [input.id, input.value]),
    )
    const flows = Object.fromEntries(
      Object.entries(this.config.flows).map(([name, controller]) => [name, controller.snapshot()]),
    )
    sessionStorage.setItem(SESSION_KEY, serializeSession(inputs, flows))
  }

  private restore() {
    if (this.config.isBusy()) {
      this.config.log("Aguarde a etapa em andamento antes de restaurar a sessão.")
      return
    }

    const saved = parseSession(sessionStorage.getItem(SESSION_KEY))
    if (!saved) return this.discard()

    for (const [id, value] of Object.entries(saved.inputs)) {
      const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
      if (input) input.value = value
    }
    for (const [name, controller] of Object.entries(this.config.flows)) {
      const state = saved.flows[name] as FlowState | undefined
      if (state) controller.restore(state)
    }

    this.resumeOfferPending = false
    setVisible(this.banner, false)
    this.config.onRestored()
    this.save()
    this.config.log("Sessão restaurada. Reconecte a wallet antes de assinar ou construir.")
  }

  private discard() {
    this.resumeOfferPending = false
    sessionStorage.removeItem(SESSION_KEY)
    setVisible(this.banner, false)
    this.config.log("Sessão salva descartada.")
  }
}

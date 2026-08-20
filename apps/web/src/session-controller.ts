import { formatDateTime, formatMessage, messageRef, type Locale } from "../../../packages/localization/src/index.js"
import type { WorkbenchFlowControllers } from "./workbench-flows.js"
import type { FlowState } from "./workbench-state.js"
import { parseSession, serializeSession } from "./workbench-session.js"
import type { WorkbenchLogger } from "./technical-log.js"
import { select, setVisible } from "./workbench-ui.js"

const SESSION_KEY = "cardano-technical-workshop.session.v1"

type SessionControllerConfig = {
  flows: WorkbenchFlowControllers
  onRestored: () => void
  isBusy: () => boolean
  log: WorkbenchLogger
  locale: () => Locale
}

export class SessionController {
  private readonly banner = select<HTMLElement>("#resumeBanner")
  private resumeOfferPending = false
  private offeredSavedAt?: string

  constructor(private readonly config: SessionControllerConfig) {
    select<HTMLButtonElement>("#resumeSession").addEventListener("click", () => this.restore())
    select<HTMLButtonElement>("#discardSession").addEventListener("click", () => this.discard())
  }

  offer() {
    const saved = parseSession(sessionStorage.getItem(SESSION_KEY))
    if (!saved) return

    this.resumeOfferPending = true
    this.offeredSavedAt = saved.savedAt
    this.renderOffer()
    setVisible(this.banner, true)
  }

  rerenderForLocale() {
    if (this.resumeOfferPending) this.renderOffer()
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
      this.config.log(messageRef("session.log.busy"))
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
    this.offeredSavedAt = undefined
    setVisible(this.banner, false)
    this.config.onRestored()
    this.save()
    this.config.log(messageRef("session.log.restored"))
  }

  private discard() {
    this.resumeOfferPending = false
    this.offeredSavedAt = undefined
    sessionStorage.removeItem(SESSION_KEY)
    setVisible(this.banner, false)
    this.config.log(messageRef("session.log.discarded"))
  }

  private renderOffer() {
    if (!this.offeredSavedAt) return
    const locale = this.config.locale()
    const savedAt = formatDateTime(this.offeredSavedAt, locale, {
      dateStyle: "short",
      timeStyle: "medium",
    })
    select<HTMLElement>("#resumeDescription").textContent = formatMessage(
      messageRef("session.description", { savedAt }),
      locale,
    )
  }
}

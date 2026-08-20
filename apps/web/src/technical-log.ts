import {
  formatDateTime,
  formatMessage,
  messageRef,
  type Locale,
  type MessageRef,
} from "../../../packages/localization/src/index.js"
import { select, setVisible } from "./workbench-ui.js"

export type LogLevel = "info" | "error"
export type WorkbenchLogger = (message: MessageRef, level?: LogLevel, technicalDetail?: string) => void

type TechnicalLogEntry = {
  timestamp: Date
  message: MessageRef
  level: LogLevel
  technicalDetail?: string
}

export class TechnicalLogController {
  private readonly launcher = select<HTMLButtonElement>("#technicalLogButton")
  private readonly badge = select<HTMLElement>("#technicalLogBadge")
  private readonly announcement = select<HTMLElement>("#technicalLogAnnouncement")
  private readonly dialog = select<HTMLDialogElement>("#technicalLogDialog")
  private readonly closeButton = select<HTMLButtonElement>("#technicalLogClose")
  private readonly output = select<HTMLPreElement>("#log")
  private readonly entries: Array<TechnicalLogEntry> = []
  private unreadErrors = 0

  constructor(private readonly locale: () => Locale) {
    this.launcher.addEventListener("click", () => this.open())
    this.closeButton.addEventListener("click", () => this.dialog.close())
    this.dialog.addEventListener("close", () => this.launcher.focus())
    this.dialog.addEventListener("click", (event) => {
      if (event.target !== this.dialog) return
      const bounds = this.dialog.getBoundingClientRect()
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom
      if (!inside) this.dialog.close()
    })
    this.render()
  }

  readonly write: WorkbenchLogger = (message, level = "info", technicalDetail) => {
    this.entries.push({ timestamp: new Date(), message, level, technicalDetail })
    this.renderEntries()
    this.output.scrollTop = this.output.scrollHeight

    if (level !== "error" || this.dialog.open) return
    this.unreadErrors += 1
    this.renderAttention()
  }

  rerenderForLocale() {
    this.render()
  }

  private open() {
    if (!this.dialog.open) this.dialog.showModal()
    this.unreadErrors = 0
    this.announcement.textContent = ""
    this.renderAttention()
    this.closeButton.focus()
    this.output.scrollTop = this.output.scrollHeight
  }

  private render() {
    this.renderEntries()
    this.renderAttention()
  }

  private renderEntries() {
    const locale = this.locale()
    this.output.replaceChildren(...this.entries.map((entry) => {
      const element = document.createElement("span")
      element.className = "log-entry"
      element.dataset.level = entry.level
      const detail = entry.technicalDetail ? `\n  ${entry.technicalDetail}` : ""
      element.textContent = `${formatDateTime(entry.timestamp, locale, { timeStyle: "medium" })}  ${formatMessage(entry.message, locale)}${detail}\n`
      return element
    }))
  }

  private renderAttention() {
    const hasErrors = this.unreadErrors > 0
    const locale = this.locale()
    const count = new Intl.NumberFormat(locale).format(this.unreadErrors)
    setVisible(this.badge, hasErrors)
    this.badge.textContent = this.unreadErrors > 9 ? "9+" : String(this.unreadErrors)
    this.launcher.dataset.hasErrors = String(hasErrors)
    this.announcement.textContent = hasErrors
      ? formatMessage(messageRef(
        this.unreadErrors === 1 ? "technicalLog.newError.one" : "technicalLog.newError.other",
        { count },
      ), locale)
      : ""
    this.launcher.setAttribute("aria-label", formatMessage(messageRef(
      !hasErrors
        ? "technicalLog.open"
        : this.unreadErrors === 1
          ? "technicalLog.openUnread.one"
          : "technicalLog.openUnread.other",
      { count },
    ), locale))
  }
}

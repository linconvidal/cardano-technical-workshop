import { select, setVisible } from "./workbench-ui.js"

export type LogLevel = "info" | "error"
export type WorkbenchLogger = (message: string, level?: LogLevel) => void

export class TechnicalLogController {
  private readonly launcher = select<HTMLButtonElement>("#technicalLogButton")
  private readonly badge = select<HTMLElement>("#technicalLogBadge")
  private readonly announcement = select<HTMLElement>("#technicalLogAnnouncement")
  private readonly dialog = select<HTMLDialogElement>("#technicalLogDialog")
  private readonly closeButton = select<HTMLButtonElement>("#technicalLogClose")
  private readonly output = select<HTMLPreElement>("#log")
  private unreadErrors = 0

  constructor() {
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
    this.renderAttention()
  }

  readonly write: WorkbenchLogger = (message, level = "info") => {
    const entry = document.createElement("span")
    entry.className = "log-entry"
    entry.dataset.level = level
    entry.textContent = `${new Date().toLocaleTimeString()}  ${message}\n`
    this.output.append(entry)
    this.output.scrollTop = this.output.scrollHeight

    if (level !== "error" || this.dialog.open) return
    this.unreadErrors += 1
    this.announcement.textContent = this.unreadErrors === 1
      ? "Novo erro no log técnico."
      : `${this.unreadErrors} erros não lidos no log técnico.`
    this.renderAttention()
  }

  private open() {
    if (!this.dialog.open) this.dialog.showModal()
    this.unreadErrors = 0
    this.announcement.textContent = ""
    this.renderAttention()
    this.closeButton.focus()
    this.output.scrollTop = this.output.scrollHeight
  }

  private renderAttention() {
    const hasErrors = this.unreadErrors > 0
    setVisible(this.badge, hasErrors)
    this.badge.textContent = this.unreadErrors > 9 ? "9+" : String(this.unreadErrors)
    this.launcher.dataset.hasErrors = String(hasErrors)
    this.launcher.setAttribute(
      "aria-label",
      hasErrors
        ? `Abrir log técnico, ${this.unreadErrors} ${this.unreadErrors === 1 ? "erro não lido" : "erros não lidos"}`
        : "Abrir log técnico",
    )
  }
}

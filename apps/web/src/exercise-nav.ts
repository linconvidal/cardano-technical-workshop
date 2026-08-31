import { select } from "./workbench-ui.js"

type ExerciseNavEntry = {
  link: HTMLAnchorElement
  section: HTMLElement
  completionTarget: HTMLElement
  index: HTMLElement
  indexText: string
  completeLabel: HTMLElement
}

const exerciseCompletionTargets = {
  "#paymentPanel": "#paymentPanel",
  "#metadataPanel": "#metadataPanel",
  "#multisigExercise": "#multisigUnlockPanel",
  "#eacMintPanel": "#eacRetirePanel",
  "#mintPanel": "#mintPanel",
} as const

export class ExerciseNavController {
  private readonly nav = select<HTMLElement>(".exercise-nav")
  private readonly entries = [...this.nav.querySelectorAll<HTMLAnchorElement>("a[href^='#']")]
    .map((link): ExerciseNavEntry => {
      const section = document.querySelector<HTMLElement>(link.hash)
      if (!section) throw new Error(`Exercise navigation target not found: ${link.hash}`)
      const completionSelector = exerciseCompletionTargets[link.hash as keyof typeof exerciseCompletionTargets]
      const completionTarget = completionSelector
        ? document.querySelector<HTMLElement>(completionSelector)
        : undefined
      const index = link.firstElementChild as HTMLElement | null
      const completeLabel = link.querySelector<HTMLElement>(".exercise-nav-complete-label")
      if (!completionTarget || !index || !completeLabel) {
        throw new Error(`Exercise completion target not found: ${link.hash}`)
      }
      return { link, section, completionTarget, index, indexText: index.textContent.trim(), completeLabel }
    })
  private frameRequested = false

  constructor() {
    window.addEventListener("scroll", this.scheduleRefresh, { passive: true })
    window.addEventListener("resize", this.scheduleRefresh)
    this.refresh()
  }

  refresh = () => {
    this.frameRequested = false
    this.refreshCompletion()
    const threshold = this.nav.getBoundingClientRect().bottom + 24
    let active = this.entries[0]

    for (const entry of this.entries) {
      if (entry.section.getBoundingClientRect().top > threshold) break
      active = entry
    }

    for (const entry of this.entries) {
      if (entry === active) entry.link.setAttribute("aria-current", "location")
      else entry.link.removeAttribute("aria-current")
    }
  }

  private refreshCompletion() {
    for (const entry of this.entries) {
      const complete = entry.completionTarget.dataset.stage === "included"
      entry.completeLabel.hidden = !complete
      if (complete === (entry.link.dataset.complete === "true")) continue

      if (complete) {
        entry.link.dataset.complete = "true"
        entry.index.replaceChildren(completionCheck(entry.index.ownerDocument))
      } else {
        delete entry.link.dataset.complete
        entry.index.textContent = entry.indexText
      }
    }
  }

  private readonly scheduleRefresh = () => {
    if (this.frameRequested) return
    this.frameRequested = true
    window.requestAnimationFrame(this.refresh)
  }
}

const completionCheck = (document: Document): SVGSVGElement => {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  icon.classList.add("exercise-nav-check")
  icon.setAttribute("viewBox", "0 0 24 24")
  icon.setAttribute("aria-hidden", "true")
  icon.setAttribute("focusable", "false")
  icon.innerHTML = '<path d="m5 12 4 4L19 6"/>'
  return icon
}

import hljs from "highlight.js/lib/core"
import typescript from "highlight.js/lib/languages/typescript"

import {
  formatMessage,
  messageRef,
  type Locale,
} from "../../../packages/localization/src/index.js"
import {
  extractCodeExcerpt,
  githubSourceHref,
  stepCodeDefinitions,
  stepCodeFlowIds,
  stepCodeFlowRoots,
  type ExtractedCodeExcerpt,
  type StepCodeFlowId,
} from "./step-code-catalog.js"
import { stepCodeSources } from "./step-code-sources.js"
import { select, selectWithin } from "./workbench-ui.js"

type StepCodeBinding = {
  flowId: StepCodeFlowId
  stepIndex: number
  root: HTMLElement
  step: HTMLElement
  button: HTMLButtonElement
}

hljs.registerLanguage("typescript", typescript)

export class StepCodeController {
  private readonly dialog = select<HTMLDialogElement>("#stepCodeDialog")
  private readonly title = select<HTMLElement>("#stepCodeTitle")
  private readonly description = select<HTMLElement>("#stepCodeDescription")
  private readonly closeButton = select<HTMLButtonElement>("#stepCodeClose")
  private readonly excerpts = select<HTMLElement>("#stepCodeExcerpts")
  private readonly bindings: Array<StepCodeBinding> = []
  private activeBinding?: StepCodeBinding

  constructor(private readonly locale: () => Locale) {
    this.hydrateButtons()
    this.closeButton.addEventListener("click", () => this.dialog.close())
    this.dialog.addEventListener("close", () => this.activeBinding?.button.focus())
    this.dialog.addEventListener("click", (event) => this.closeFromBackdrop(event))
    this.rerenderForLocale()
  }

  rerenderForLocale() {
    for (const binding of this.bindings) this.renderButton(binding)
    if (this.dialog.open && this.activeBinding) this.renderDialog(this.activeBinding)
  }

  private hydrateButtons() {
    for (const flowId of stepCodeFlowIds) {
      const root = select<HTMLElement>(stepCodeFlowRoots[flowId])
      const pipeline = root.querySelector<HTMLOListElement>(":scope > .flow-zone-steps .pipeline")
      if (!pipeline) throw new Error(`Step code pipeline not found: ${flowId}`)

      const steps = [...pipeline.querySelectorAll<HTMLElement>(":scope > [data-progress-step]")]
      const definitions = stepCodeDefinitions[flowId]
      if (steps.length !== definitions.length) {
        throw new Error(`Step code count mismatch: ${flowId} has ${steps.length} steps and ${definitions.length} definitions`)
      }

      steps.forEach((step, stepIndex) => {
        const content = selectWithin<HTMLElement>(step, ":scope > div")
        const button = this.createButton(flowId, stepIndex)
        const binding = { flowId, stepIndex, root, step, button }
        button.addEventListener("click", () => this.open(binding))
        content.append(button)
        this.bindings.push(binding)
      })
    }
  }

  private createButton(flowId: StepCodeFlowId, stepIndex: number): HTMLButtonElement {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "step-code-button"
    button.dataset.stepCodeFlow = flowId
    button.dataset.stepCodeIndex = String(stepIndex + 1)
    button.setAttribute("aria-haspopup", "dialog")
    button.setAttribute("aria-controls", "stepCodeDialog")
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/></svg><span class="step-code-button-label sr-only"></span>'
    return button
  }

  private renderButton(binding: StepCodeBinding) {
    const step = stepTitle(binding.step)
    const exercise = exerciseTitle(binding.root)
    const label = formatMessage(messageRef("stepCode.button"), this.locale())
    selectWithin<HTMLElement>(binding.button, ".step-code-button-label").textContent = label
    binding.button.title = label
    binding.button.setAttribute("aria-label", formatMessage(messageRef(
      "stepCode.buttonLabel",
      { step, exercise },
    ), this.locale()))
  }

  private open(binding: StepCodeBinding) {
    this.activeBinding = binding
    this.renderDialog(binding)
    if (!this.dialog.open) this.dialog.showModal()
    this.closeButton.focus()
  }

  private renderDialog(binding: StepCodeBinding) {
    const locale = this.locale()
    const step = stepTitle(binding.step)
    const exercise = exerciseTitle(binding.root)
    this.title.textContent = formatMessage(messageRef("stepCode.title", { step, exercise }), locale)
    this.description.textContent = selectWithin<HTMLElement>(binding.step, "small").textContent?.trim() ?? ""

    const definition = stepCodeDefinitions[binding.flowId][binding.stepIndex]
    const extracted = definition.excerpts.map((excerpt) => extractCodeExcerpt(stepCodeSources, excerpt))
    this.excerpts.replaceChildren(...extracted.map((excerpt) => renderExcerpt(excerpt, locale)))
    this.dialog.scrollTop = 0
  }

  private closeFromBackdrop(event: MouseEvent) {
    if (event.target !== this.dialog) return
    const bounds = this.dialog.getBoundingClientRect()
    const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
      event.clientY >= bounds.top && event.clientY <= bounds.bottom
    if (!inside) this.dialog.close()
  }
}

const renderExcerpt = (excerpt: ExtractedCodeExcerpt, locale: Locale): HTMLElement => {
  const section = document.createElement("section")
  section.className = "step-code-excerpt"

  const header = document.createElement("header")
  const href = githubSourceHref(excerpt, __WORKBENCH_SOURCE_REVISION__)
  const source = document.createElement(href ? "a" : "span")
  source.className = "step-code-source"
  source.textContent = `${excerpt.path}:${excerpt.startLine}-${excerpt.endLine}`
  if (source instanceof HTMLAnchorElement && href) {
    source.href = href
    source.target = "_blank"
    source.rel = "noreferrer"
  } else {
    source.dataset.local = "true"
  }
  source.setAttribute("aria-label", formatMessage(messageRef(
    href ? "stepCode.sourceLabel" : "stepCode.localSourceLabel",
    {
      path: excerpt.path,
      startLine: excerpt.startLine,
      endLine: excerpt.endLine,
    },
  ), locale))
  const language = document.createElement("span")
  language.className = "step-code-language"
  language.textContent = "TypeScript"
  header.append(source, language)

  const pre = document.createElement("pre")
  pre.tabIndex = 0
  const code = document.createElement("code")
  code.className = "hljs language-typescript"
  code.innerHTML = hljs.highlight(excerpt.code, {
    language: "typescript",
    ignoreIllegals: true,
  }).value
  pre.append(code)
  section.append(header, pre)
  return section
}

const stepTitle = (step: HTMLElement): string =>
  selectWithin<HTMLElement>(step, "strong").textContent?.trim() || ""

const exerciseTitle = (root: HTMLElement): string => {
  const titleId = root.getAttribute("aria-labelledby")
  return titleId ? document.getElementById(titleId)?.textContent?.trim() || "" : ""
}

import type { FlowView } from "./flow-renderer.js"

type FlowBindingConfig = {
  inputSelectors: ReadonlyArray<string>
  editableUnsigned?: boolean
  editableWitnessIndexes?: ReadonlyArray<number>
}

type FlowBindingHandlers = {
  build: () => void
  sign: () => void
  merge: () => void
  submit: () => void
  check: () => void
  retry: () => void
  reset: () => void
  acknowledge: (accepted: boolean) => void
  inputMutation: () => void
  unsignedImport: (value: string) => void
  witnessImport: (index: number, value: string) => void
}

export const bindFlowView = (
  view: FlowView,
  config: FlowBindingConfig,
  handlers: FlowBindingHandlers,
) => {
  view.actions.build.addEventListener("click", handlers.build)
  view.actions.sign.addEventListener("click", handlers.sign)
  view.actions.merge.addEventListener("click", handlers.merge)
  view.actions.submit.addEventListener("click", handlers.submit)
  view.actions.check.addEventListener("click", handlers.check)
  view.retry.addEventListener("click", handlers.retry)
  view.reset.addEventListener("click", handlers.reset)
  view.acknowledge.addEventListener("change", () => handlers.acknowledge(view.acknowledge.checked))

  for (const selector of config.inputSelectors) {
    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)
    if (!element) throw new Error(`Input do fluxo não encontrado: ${selector}`)
    element.addEventListener("input", handlers.inputMutation)
    element.addEventListener("change", handlers.inputMutation)
  }

  if (config.editableUnsigned) {
    view.unsigned.addEventListener("input", () => handlers.unsignedImport(view.unsigned.value))
  }

  for (const index of config.editableWitnessIndexes ?? []) {
    view.witnesses[index].addEventListener("input", () => handlers.witnessImport(index, view.witnesses[index].value))
  }
}

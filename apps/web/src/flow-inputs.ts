import { snapshotInputs } from "./flow-fingerprint.js"

export const validateFlowInputs = (selectors: ReadonlyArray<string>): boolean => {
  const invalid = selectors
    .map((selector) => document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector))
    .find((element) => element && !element.checkValidity())

  if (!invalid) return true
  invalid.reportValidity()
  invalid.focus()
  return false
}

export const flowInputFingerprint = (selectors: ReadonlyArray<string>): string =>
  snapshotInputs(Object.fromEntries(selectors.map((selector) => {
    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)
    return [selector, element?.value.trim() ?? ""]
  })))

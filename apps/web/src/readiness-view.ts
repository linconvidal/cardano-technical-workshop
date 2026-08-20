import {
  formatMessage,
  messageRef,
  type Locale,
  type MessageKey,
  type MessageRef,
} from "../../../packages/localization/src/index.js"
import type { WorkbenchReadiness } from "./readiness.js"
import { select } from "./workbench-ui.js"
import { discoverWallets } from "./wallet.js"

export const populateWalletOptions = (
  locale: Locale,
  selected = select<HTMLSelectElement>("#walletName").value,
) => {
  const walletNameInput = select<HTMLSelectElement>("#walletName")
  const connectButton = select<HTMLButtonElement>("#connectWallet")
  const wallets = discoverWallets(locale)
  walletNameInput.replaceChildren()

  if (wallets.length === 0) {
    walletNameInput.add(new Option(formatMessage(messageRef("readiness.wallet.none"), locale), ""))
    walletNameInput.disabled = true
    connectButton.disabled = true
    return
  }

  walletNameInput.disabled = false
  for (const wallet of wallets) walletNameInput.add(new Option(wallet.name, wallet.key))
  walletNameInput.value = wallets.some((wallet) => wallet.key === selected) ? selected : wallets[0].key
  connectButton.disabled = false
}

export const renderReadiness = (readiness: WorkbenchReadiness, locale: Locale) => {
  const response = readiness.response
  setReadinessItem("backendReadiness", readiness.error ? "error" : response ? "ready" : "checking", locale)
  setReadinessItem(
    "providerReadiness",
    response?.provider.healthy ? "ready" : response?.provider.configured ? "warning" : response ? "error" : "checking",
    locale,
  )
  setReadinessItem("walletExtensionReadiness", discoverWallets(locale).length > 0 ? "ready" : "error", locale)
  setReadinessItem("walletNetworkReadiness", readiness.walletConnected ? "ready" : "pending", locale)
  setReadinessItem(
    "walletFundingReadiness",
    !readiness.walletConnected ? "pending" : response?.wallet?.funded ? "ready" : "warning",
    locale,
  )

  const message = select<HTMLElement>("#readinessMessage")
  if (readiness.checking) setReadinessMessage(message, messageRef("readiness.message.checking"), "info", locale)
  else if (readiness.error) setReadinessMessage(message, messageRef("readiness.message.error"), "error", locale)
  else if (!response?.provider.configured) setReadinessMessage(
    message,
    messageRef("readiness.message.providerMissing"),
    "error",
    locale,
  )
  else if (!response.provider.healthy) setReadinessMessage(
    message,
    messageRef("readiness.message.providerUnavailable"),
    "error",
    locale,
  )
  else if (!readiness.walletConnected) setReadinessMessage(
    message,
    messageRef("readiness.message.connectWallet"),
    "info",
    locale,
  )
  else if (!response.wallet?.funded) setReadinessMessage(
    message,
    messageRef("readiness.message.walletUnfunded"),
    "warning",
    locale,
  )
  else setReadinessMessage(
    message,
    messageRef(
      response.wallet.utxoCount === 1 ? "readiness.message.ready.one" : "readiness.message.ready.other",
      { count: new Intl.NumberFormat(locale).format(response.wallet.utxoCount) },
    ),
    "success",
    locale,
  )
}

const setReadinessMessage = (
  element: HTMLElement,
  reference: MessageRef,
  tone: "info" | "warning" | "error" | "success",
  locale: Locale,
) => {
  element.textContent = formatMessage(reference, locale)
  element.dataset.tone = tone
}

type ReadinessStatus = "checking" | "pending" | "ready" | "warning" | "error"

const statusKeys = {
  checking: "readiness.status.checking",
  pending: "readiness.status.pending",
  ready: "readiness.status.ready",
  warning: "readiness.status.warning",
  error: "readiness.status.error",
} as const satisfies Record<ReadinessStatus, MessageKey>

const itemKeys = {
  backendReadiness: "readiness.item.backend",
  providerReadiness: "readiness.item.provider",
  walletExtensionReadiness: "readiness.item.extension",
  walletNetworkReadiness: "readiness.item.network",
  walletFundingReadiness: "readiness.item.funding",
} as const satisfies Record<string, MessageKey>

const setReadinessItem = (id: keyof typeof itemKeys, status: ReadinessStatus, locale: Locale) => {
  const item = select<HTMLElement>(`#${id}`)
  const label = formatMessage(messageRef(statusKeys[status]), locale)
  const title = formatMessage(messageRef(itemKeys[id]), locale)
  item.dataset.status = status
  item.dataset.statusLabel = label
  item.setAttribute("aria-label", formatMessage(messageRef("readiness.item.label", { title, status: label }), locale))
  item.setAttribute("aria-live", "polite")
}

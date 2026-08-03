import type { WorkbenchReadiness } from "./readiness.js"
import { select } from "./workbench-ui.js"
import { discoverWallets } from "./wallet.js"

export const populateWalletOptions = (selected = select<HTMLSelectElement>("#walletName").value) => {
  const walletNameInput = select<HTMLSelectElement>("#walletName")
  const connectButton = select<HTMLButtonElement>("#connectWallet")
  const wallets = discoverWallets()
  walletNameInput.replaceChildren()

  if (wallets.length === 0) {
    walletNameInput.add(new Option("Nenhuma wallet CIP-30 detectada", ""))
    walletNameInput.disabled = true
    connectButton.disabled = true
    return
  }

  walletNameInput.disabled = false
  for (const wallet of wallets) walletNameInput.add(new Option(wallet.name, wallet.key))
  walletNameInput.value = wallets.some((wallet) => wallet.key === selected) ? selected : wallets[0].key
  connectButton.disabled = false
}

export const renderReadiness = (readiness: WorkbenchReadiness) => {
  const response = readiness.response
  setReadinessItem("backendReadiness", readiness.error ? "error" : response ? "ready" : "checking")
  setReadinessItem(
    "providerReadiness",
    response?.provider.healthy ? "ready" : response?.provider.configured ? "warning" : response ? "error" : "checking",
  )
  setReadinessItem("walletExtensionReadiness", discoverWallets().length > 0 ? "ready" : "error")
  setReadinessItem("walletNetworkReadiness", readiness.walletConnected ? "ready" : "pending")
  setReadinessItem(
    "walletFundingReadiness",
    !readiness.walletConnected ? "pending" : response?.wallet?.funded ? "ready" : "warning",
  )

  const message = select<HTMLElement>("#readinessMessage")
  if (readiness.checking) setReadinessMessage(message, "Verificando backend e Blockfrost Preprod...", "info")
  else if (readiness.error) setReadinessMessage(
    message,
    `${readiness.error}. Confirme que npm run dev está em execução.`,
    "error",
  )
  else if (!response?.provider.configured) setReadinessMessage(
    message,
    "Configure BLOCKFROST_PROJECT_ID no backend e reinicie a Workbench.",
    "error",
  )
  else if (!response.provider.healthy) setReadinessMessage(
    message,
    "O Blockfrost Preprod está indisponível. Seus campos e artefatos continuam nesta aba; aguarde e tente novamente.",
    "error",
  )
  else if (!readiness.walletConnected) setReadinessMessage(
    message,
    "Backend pronto. Conecte uma wallet configurada em Preprod.",
    "info",
  )
  else if (!response.wallet?.funded) setReadinessMessage(
    message,
    "Wallet conectada, mas sem UTxO visível na Preprod. Confirme a rede e receba tADA.",
    "warning",
  )
  else setReadinessMessage(
    message,
    `Ambiente pronto. ${response.wallet.utxoCount} UTxO(s) encontrado(s) para esta wallet.`,
    "success",
  )
}

const setReadinessMessage = (
  element: HTMLElement,
  text: string,
  tone: "info" | "warning" | "error" | "success",
) => {
  element.textContent = text
  element.dataset.tone = tone
}

const setReadinessItem = (
  id: string,
  status: "checking" | "pending" | "ready" | "warning" | "error",
) => {
  const item = select<HTMLElement>(`#${id}`)
  const label = ({
    checking: "Verificando",
    pending: "Pendente",
    ready: "Pronto",
    warning: "Atenção",
    error: "Erro",
  })[status]
  const title = item.querySelector("strong")?.textContent ?? id
  item.dataset.status = status
  item.dataset.statusLabel = label
  item.setAttribute("aria-label", `${title}: ${label}`)
  item.setAttribute("aria-live", "polite")
}

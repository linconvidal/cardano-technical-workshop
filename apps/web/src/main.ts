import "./styles.css"

import { MultisigSetupController } from "./multisig-setup.js"
import {
  canBuildTransactions,
  checkReadiness,
  initialReadiness,
  type WorkbenchReadiness,
} from "./readiness.js"
import { populateWalletOptions, renderReadiness } from "./readiness-view.js"
import { SessionController } from "./session-controller.js"
import { TechnicalLogController } from "./technical-log.js"
import { createWorkbenchFlows } from "./workbench-flows.js"
import { copyArtifact, hydrateArtifactBoxes, select } from "./workbench-ui.js"
import { connectWallet, type WalletSession } from "./wallet.js"

hydrateArtifactBoxes()

const walletNameInput = select<HTMLSelectElement>("#walletName")
const connectWalletButton = select<HTMLButtonElement>("#connectWallet")
const addressOutput = select<HTMLElement>("#connectedAddress")
const readinessMessage = select<HTMLElement>("#readinessMessage")
const technicalLog = new TechnicalLogController()
const log = technicalLog.write

let walletSession: WalletSession | undefined
let readiness: WorkbenchReadiness = initialReadiness()
let readinessGeneration = 0
let sessionController: SessionController | undefined
let multisigSetup: MultisigSetupController | undefined

const flowControllers = createWorkbenchFlows({
  wallet: requireWallet,
  fundedReadiness: () => ({
    walletConnected: Boolean(walletSession),
    canBuild: canBuildTransactions(readiness),
    backendReady: Boolean(readiness.response?.ok),
  }),
  eacRetirementReadiness: () => ({
    walletConnected: Boolean(walletSession),
    canBuild: Boolean(
      canBuildTransactions(readiness) && flowControllers.eacMint.snapshot().stage === "included",
    ),
    backendReady: Boolean(readiness.response?.ok),
  }),
  multisigLockReadiness: () => ({
    walletConnected: Boolean(walletSession),
    canBuild: Boolean(canBuildTransactions(readiness) && multisigSetup?.isReadyForLock()),
    backendReady: Boolean(readiness.response?.ok),
  }),
  scriptSpendReadiness: () => ({
    walletConnected: Boolean(walletSession),
    canBuild: Boolean(
      walletSession && readiness.response?.ok && multisigSetup?.isReadyForUnlockBuild(),
    ),
    backendReady: Boolean(readiness.response?.ok),
  }),
  multisigSetupReady: () => Boolean(multisigSetup?.isReadyForLock()),
  onChange: () => {
    sessionController?.save()
    refreshControllers()
  },
  log,
})

multisigSetup = new MultisigSetupController({
  wallet: () => walletSession,
  onInputChange: () => sessionController?.save(),
  onSetupChange: refreshControllers,
  log,
})

sessionController = new SessionController({
  flows: flowControllers,
  onRestored: () => {
    multisigSetup?.refreshReadiness()
    refreshControllers()
  },
  isBusy: () => Boolean(
    multisigSetup?.isBusy() || Object.values(flowControllers).some((controller) => controller.isBusy()),
  ),
  log,
})

bindCopyButtons()
bindWalletControls()
void initialize()

async function initialize() {
  populateWalletOptions()
  sessionController?.offer()
  await refreshReadiness()
  refreshControllers()
}

function bindWalletControls() {
  connectWalletButton.addEventListener("click", () => { void handleConnectWallet() })
  select<HTMLInputElement>("#multisigSecondSigner").addEventListener("input", () => {
    multisigSetup?.invalidate("Os signers mudaram. Gere e revise novamente o script 2-de-2.")
  })
}

async function handleConnectWallet() {
  if (multisigSetup?.isBusy() || Object.values(flowControllers).some((controller) => controller.isBusy())) {
    readinessMessage.dataset.tone = "warning"
    readinessMessage.textContent = "Aguarde a etapa em andamento antes de trocar a wallet."
    return
  }

  const providerKey = walletNameInput.value
  if (!providerKey) return

  const previousAddress = walletSession?.address
  connectWalletButton.disabled = true
  connectWalletButton.setAttribute("aria-busy", "true")
  readinessMessage.dataset.tone = "info"
  readinessMessage.textContent = "Aguardando autorização da extensão..."

  try {
    walletSession = await connectWallet(providerKey)
    addressOutput.textContent = `${walletSession.providerName}: ${walletSession.address}`
    setDefaultAddresses(walletSession.address)
    invalidateWalletBoundFlows(previousAddress, walletSession.address)
    await refreshReadiness(walletSession.address)
    log(`Wallet conectada: ${walletSession.providerName} em testnet, ${walletSession.address}`)
  } catch (error) {
    walletSession = undefined
    multisigSetup?.invalidate("Conecte novamente o signer A e gere o script 2-de-2.")
    readiness = { ...readiness, walletConnected: false, walletAddress: undefined }
    readinessMessage.dataset.tone = "error"
    readinessMessage.textContent = error instanceof Error ? error.message : String(error)
    log(`Falha ao conectar wallet: ${readinessMessage.textContent}`, "error")
  } finally {
    connectWalletButton.removeAttribute("aria-busy")
    populateWalletOptions(providerKey)
    renderReadiness(readiness)
    refreshControllers()
  }
}

async function refreshReadiness(address?: string) {
  const generation = ++readinessGeneration
  readiness = { ...readiness, checking: true, error: undefined }
  renderReadiness(readiness)

  try {
    const response = await checkReadiness(address)
    if (generation !== readinessGeneration) return
    readiness = {
      response,
      checking: false,
      walletConnected: Boolean(walletSession),
      walletAddress: walletSession?.address,
    }
  } catch (error) {
    if (generation !== readinessGeneration) return
    readiness = {
      ...readiness,
      checking: false,
      error: error instanceof Error ? error.message : String(error),
      walletConnected: Boolean(walletSession),
      walletAddress: walletSession?.address,
    }
    log(`Falha ao verificar o ambiente: ${readiness.error}`, "error")
  }

  renderReadiness(readiness)
  refreshControllers()
}

function invalidateWalletBoundFlows(previousAddress: string | undefined, currentAddress: string) {
  flowControllers.payment.revalidateWalletAddress(currentAddress)
  flowControllers.metadata.revalidateWalletAddress(currentAddress)
  flowControllers.multisigLock.revalidateWalletAddress(currentAddress)
  flowControllers.eacMint.revalidateWalletAddress(currentAddress)
  flowControllers.eacRetire.revalidateWalletAddress(currentAddress)
  flowControllers.mint.revalidateWalletAddress(currentAddress)

  if (!previousAddress || previousAddress === currentAddress) return
  multisigSetup?.invalidate("O signer A mudou. Gere e revise novamente o script 2-de-2.")
}

function setDefaultAddresses(address: string) {
  const eacRecipient = select<HTMLInputElement>("#eacMintRecipient")
  eacRecipient.value = address
  eacRecipient.dispatchEvent(new Event("input", { bubbles: true }))

  for (const id of ["paymentRecipient", "metadataRecipient", "multisigDestination", "mintRecipient"]) {
    const input = select<HTMLInputElement>(`#${id}`)
    if (input.value.trim()) continue
    input.value = address
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

function refreshControllers() {
  Object.values(flowControllers).forEach((controller) => controller.refreshReadiness())
  multisigSetup?.refreshReadiness()
}

function requireWallet(): WalletSession {
  if (!walletSession) throw new Error("Conecte uma wallet CIP-30 em Preprod primeiro")
  return walletSession
}

function bindCopyButtons() {
  const clipboardStatus = select<HTMLElement>("#clipboardStatus")
  document.querySelectorAll<HTMLButtonElement>("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const originalText = button.textContent ?? "Copiar"
      const label = button.getAttribute("aria-label") ?? originalText
      void copyArtifact(button.dataset.copyTarget!)
        .then(() => {
          button.textContent = "Copiado"
          clipboardStatus.textContent = `${label}: concluído.`
          log(`Copiado: ${button.dataset.copyTarget}`)
        })
        .catch((error) => {
          button.textContent = "Falhou"
          clipboardStatus.textContent = `${label}: falhou. ${error instanceof Error ? error.message : String(error)}`
          log(error instanceof Error ? error.message : String(error), "error")
        })
        .finally(() => window.setTimeout(() => { button.textContent = originalText }, 2_000))
    })
  })
}

import "./styles.css"

import {
  formatMessage,
  messageRef,
  type MessageKey,
  type MessageRef,
} from "../../../packages/localization/src/index.js"
import { hydrateExerciseLayouts } from "./exercise-layout.js"
import { ExerciseNavController } from "./exercise-nav.js"
import { MessageError } from "./flow-errors.js"
import { createLocaleSelector, LocaleController } from "./locale-controller.js"
import { MultisigSetupController } from "./multisig-setup.js"
import {
  canBuildTransactions,
  checkReadiness,
  getWorkbenchNetwork,
  initialReadiness,
  type WorkbenchReadiness,
} from "./readiness.js"
import { populateWalletOptions, renderReadiness } from "./readiness-view.js"
import { SessionController } from "./session-controller.js"
import { StepCodeController } from "./step-code-controller.js"
import { errorLogDetail, formatLogDetail, TechnicalLogController } from "./technical-log.js"
import { createWorkbenchFlows } from "./workbench-flows.js"
import {
  copyArtifact,
  hydrateArtifactBoxes,
  rerenderArtifactBoxes,
  select,
  selectWithin,
} from "./workbench-ui.js"
import { connectWallet, type WalletSession } from "./wallet.js"
import { setProjectId } from "./workshop.js"
import { executionMode } from "./execution-mode.js"

document.documentElement.dataset.executionMode = executionMode
if (executionMode === "static") {
  document.querySelectorAll<HTMLElement>("[data-static-i18n]").forEach((element) => {
    element.dataset.i18n = element.dataset.staticI18n
  })
}

const localeController = new LocaleController()
hydrateArtifactBoxes(localeController.locale)
hydrateExerciseLayouts()
createLocaleSelector(localeController)
const exerciseNav = new ExerciseNavController()
const stepCode = new StepCodeController(() => localeController.locale)

const walletNameInput = select<HTMLSelectElement>("#walletName")
const configureProviderButton = select<HTMLButtonElement>("#configureProvider")
configureProviderButton.hidden = executionMode !== "static"
const connectWalletButton = select<HTMLButtonElement>("#connectWallet")
const addressOutput = select<HTMLElement>("#connectedAddress")
const readinessMessage = select<HTMLElement>("#readinessMessage")
const clipboardStatus = select<HTMLElement>("#clipboardStatus")
const technicalLog = new TechnicalLogController(() => localeController.locale)
const log = technicalLog.write

let walletSession: WalletSession | undefined
let readiness: WorkbenchReadiness = initialReadiness()
let readinessGeneration = 0
let sessionController: SessionController | undefined
let multisigSetup: MultisigSetupController | undefined
let clipboardState: {
  result: "success" | "failed"
  titleKey: MessageKey
  error?: MessageRef
} | undefined

const flowControllers = createWorkbenchFlows({
  wallet: requireWallet,
  locale: () => localeController.locale,
  fundedReadiness: () => ({
    walletConnected: Boolean(walletSession),
    canBuild: canBuildTransactions(readiness),
    providerReady: Boolean(!readiness.checking && readiness.response?.ok),
    network: getWorkbenchNetwork(readiness),
  }),
  eacRetirementReadiness: () => ({
    walletConnected: Boolean(walletSession),
    canBuild: Boolean(
      canBuildTransactions(readiness) && flowControllers.eacMint.snapshot().stage === "included",
    ),
    providerReady: Boolean(!readiness.checking && readiness.response?.ok),
    network: getWorkbenchNetwork(readiness),
  }),
  multisigLockReadiness: () => ({
    walletConnected: Boolean(walletSession),
    canBuild: Boolean(canBuildTransactions(readiness) && multisigSetup?.isReadyForLock()),
    providerReady: Boolean(!readiness.checking && readiness.response?.ok),
    network: getWorkbenchNetwork(readiness),
  }),
  scriptSpendReadiness: () => ({
    walletConnected: Boolean(walletSession),
    canBuild: Boolean(
      walletSession && !readiness.checking && readiness.response?.ok && multisigSetup?.isReadyForUnlockBuild(),
    ),
    providerReady: Boolean(!readiness.checking && readiness.response?.ok),
    network: getWorkbenchNetwork(readiness),
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
  locale: () => localeController.locale,
  onInputChange: () => sessionController?.save(),
  onSetupChange: refreshControllers,
  log,
})

sessionController = new SessionController({
  flows: flowControllers,
  locale: () => localeController.locale,
  onRestored: () => {
    multisigSetup?.refreshReadiness()
    refreshControllers()
  },
  isBusy: () => Boolean(
    multisigSetup?.isBusy() || Object.values(flowControllers).some((controller) => controller.isBusy()),
  ),
  log,
})

localeController.subscribe(() => rerenderLocalizedSurfaces())
bindCopyButtons()
bindWalletControls()
void initialize()

async function initialize() {
  populateWalletOptions(localeController.locale)
  sessionController?.offer()
  await refreshReadiness()
  refreshControllers()
}

function bindWalletControls() {
  configureProviderButton.addEventListener("click", async () => {
    if (executionMode !== "static") return
    if (multisigSetup?.isBusy() || Object.values(flowControllers).some((controller) => controller.isBusy())) return
    const key = window.prompt(formatMessage(messageRef("provider.configuration.prompt"), localeController.locale))
    if (key === null) return
    try { setProjectId(key) }
    catch {
      window.alert(formatMessage(messageRef("provider.configuration.storageFailed"), localeController.locale))
      return
    }
    await refreshReadiness(walletSession?.address)
  })
  connectWalletButton.addEventListener("click", () => { void handleConnectWallet() })
  select<HTMLInputElement>("#multisigSecondSigner").addEventListener("input", () => {
    multisigSetup?.invalidate(messageRef("multisig.status.invalidated"))
  })
}

async function handleConnectWallet() {
  if (multisigSetup?.isBusy() || Object.values(flowControllers).some((controller) => controller.isBusy())) {
    setReadinessStatus(messageRef("wallet.status.waitCurrent"), "warning")
    return
  }

  const providerKey = walletNameInput.value
  if (!providerKey) return

  const previousAddress = walletSession?.address
  connectWalletButton.disabled = true
  connectWalletButton.setAttribute("aria-busy", "true")
  setReadinessStatus(messageRef("wallet.status.authorizing"), "info")

  try {
    walletSession = await connectWallet(providerKey, getWorkbenchNetwork(readiness))
    addressOutput.textContent = `${walletSession.providerName}: ${walletSession.address}`
    setDefaultAddresses(walletSession.address)
    invalidateWalletBoundFlows(previousAddress, walletSession.address)
    await refreshReadiness(walletSession.address)
    log(messageRef("wallet.log.connected", {
      providerName: walletSession.providerName,
      address: walletSession.address,
    }))
  } catch (error) {
    walletSession = undefined
    multisigSetup?.invalidate(messageRef("multisig.status.connectAgain"))
    readiness = { ...readiness, walletConnected: false, walletAddress: undefined }
    const reference = error instanceof MessageError ? error.messageRef : messageRef("wallet.status.connectFailed")
    setReadinessStatus(reference, "error")
    log(messageRef("wallet.log.connectFailed"), "error", errorLogDetail(error))
  } finally {
    connectWalletButton.removeAttribute("aria-busy")
    populateWalletOptions(localeController.locale, providerKey)
    renderReadiness(readiness, localeController.locale)
    refreshControllers()
  }
}

async function refreshReadiness(address?: string) {
  const generation = ++readinessGeneration
  readiness = { ...readiness, checking: true, error: undefined }
  renderReadiness(readiness, localeController.locale)
  refreshControllers()

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
    const detail = errorLogDetail(error)
    readiness = {
      checking: false,
      error: formatLogDetail(detail, localeController.locale),
      walletConnected: Boolean(walletSession),
      walletAddress: walletSession?.address,
    }
    log(messageRef("readiness.log.failed"), "error", detail)
  }

  renderReadiness(readiness, localeController.locale)
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
  multisigSetup?.invalidate(messageRef("multisig.status.signerChanged"))
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
  configureProviderButton.disabled = readiness.checking || Boolean(multisigSetup?.isBusy()) ||
    Object.values(flowControllers).some((controller) => controller.isBusy())
  Object.values(flowControllers).forEach((controller) => controller.refreshReadiness())
  multisigSetup?.refreshReadiness()
  exerciseNav.refresh()
}

function rerenderLocalizedSurfaces() {
  const selectedWallet = walletNameInput.value
  addressOutput.textContent = walletSession
    ? `${walletSession.providerName}: ${walletSession.address}`
    : formatMessage(messageRef("readiness.wallet.noneConnected"), localeController.locale)
  populateWalletOptions(localeController.locale, selectedWallet)
  renderReadiness(readiness, localeController.locale)
  rerenderArtifactBoxes(localeController.locale)
  Object.values(flowControllers).forEach((controller) => controller.rerenderForLocale())
  multisigSetup?.rerenderForLocale()
  sessionController?.rerenderForLocale()
  exerciseNav.refresh()
  stepCode.rerenderForLocale()
  technicalLog.rerenderForLocale()
  renderClipboardStatus()
  document.querySelectorAll<HTMLButtonElement>("[data-copy-target]").forEach(renderCopyButton)
}

function requireWallet(): WalletSession {
  if (!walletSession) throw new MessageError("wallet_required", messageRef("wallet.error.required"))
  return walletSession
}

function bindCopyButtons() {
  document.querySelectorAll<HTMLButtonElement>("[data-copy-target]").forEach((button) => {
    button.dataset.copyState = "idle"
    renderCopyButton(button)
    button.addEventListener("click", () => {
      const target = button.dataset.copyTarget!
      const titleKey = button.dataset.artifactTitleKey as MessageKey
      button.dataset.copyState = "pending"
      renderCopyButton(button)
      void copyArtifact(target)
        .then(() => {
          button.dataset.copyState = "success"
          renderCopyButton(button)
          clipboardState = { result: "success", titleKey }
          renderClipboardStatus()
          log(messageRef("clipboard.log.copied", { target }))
        })
        .catch((error) => {
          button.dataset.copyState = "failed"
          renderCopyButton(button)
          const errorRef = error instanceof MessageError ? error.messageRef : messageRef("clipboard.error.generic")
          clipboardState = { result: "failed", titleKey, error: errorRef }
          renderClipboardStatus()
          log(messageRef("clipboard.log.failed", { target }), "error", errorLogDetail(error))
        })
        .finally(() => window.setTimeout(() => {
          button.dataset.copyState = "idle"
          renderCopyButton(button)
        }, 2_000))
    })
  })
}

function renderCopyButton(button: HTMLButtonElement) {
  const state = button.dataset.copyState
  const key = state === "success"
    ? "clipboard.copied"
    : state === "failed"
      ? "clipboard.failed"
      : "clipboard.copy"
  const label = formatMessage(messageRef(key), localeController.locale)
  selectWithin<HTMLElement>(button, ".copy-button-label").textContent = label
  button.title = label
}

function renderClipboardStatus() {
  if (!clipboardState) {
    clipboardStatus.textContent = ""
    return
  }
  const locale = localeController.locale
  const title = formatMessage(messageRef(clipboardState.titleKey), locale)
  const label = formatMessage(messageRef("artifact.copyLabel", { title }), locale)
  clipboardStatus.textContent = formatMessage(messageRef(
    clipboardState.result === "success" ? "clipboard.status.success" : "clipboard.status.failed",
    {
      label,
      message: clipboardState.error ? formatMessage(clipboardState.error, locale) : "",
    },
  ), locale)
}

function setReadinessStatus(reference: MessageRef, tone: "info" | "warning" | "error") {
  readinessMessage.dataset.tone = tone
  readinessMessage.textContent = formatMessage(reference, localeController.locale)
}

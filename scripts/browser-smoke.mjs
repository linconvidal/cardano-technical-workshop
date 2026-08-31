import assert from "node:assert/strict"
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))
const currentSourceRevision = () => {
  try {
    const changes = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim()
    if (changes) return ""
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim().toLowerCase()
  } catch {
    return ""
  }
}

const expectedSourceRevision = currentSourceRevision()
const appUrl = process.env.WORKBENCH_URL ?? "http://127.0.0.1:5173"
const chromeBinary = process.env.CHROME_BIN ?? "google-chrome"
const debugPort = 9300 + process.pid % 300
const profileDirectory = await mkdtemp(join(tmpdir(), "cardano-workbench-smoke-"))
const chrome = spawn(chromeBinary, [
  "--headless",
  "--disable-gpu",
  "--hide-scrollbars",
  "--lang=en-US",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDirectory}`,
  "--window-size=1280,900",
  appUrl,
], { stdio: ["ignore", "ignore", "pipe"] })

let stderr = ""
chrome.stderr.on("data", (chunk) => { stderr += chunk.toString() })

try {
  const target = await waitForPage(debugPort, appUrl)
  const cdp = await connectCdp(target.webSocketDebuggerUrl)
  const observedApiRequests = []
  const browserProblems = []
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    browserProblems.push(`Uncaught exception: ${exceptionDetails?.text ?? "unknown"}`)
  })
  cdp.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type !== "error" && type !== "assert") return
    const text = args?.map((argument) => argument.value ?? argument.description ?? "").join(" ")
    browserProblems.push(`Console ${type}: ${text}`)
  })
  cdp.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error") browserProblems.push(`Browser log: ${entry.text}`)
  })
  cdp.on("Network.requestWillBeSent", ({ request }) => {
    if (!request?.url?.includes("/api/")) return
    const acceptLanguage = Object.entries(request.headers ?? {})
      .find(([name]) => name.toLowerCase() === "accept-language")?.[1]
    observedApiRequests.push({ url: request.url, acceptLanguage })
  })
  await cdp.send("Runtime.enable")
  await cdp.send("Page.enable")
  await cdp.send("Network.enable")
  await cdp.send("Log.enable")
  await cdp.send("Accessibility.enable")
  await waitForWorkbench(cdp)

  const desktop = await evaluate(cdp, `(() => ({
    title: document.title,
    htmlLang: document.documentElement.lang,
    navigatorLanguage: navigator.language,
    selector: (() => {
      const select = document.querySelector('#languageSelector')
      const label = document.querySelector('label[for="languageSelector"]')
      return {
        value: select?.value,
        visible: Boolean(select?.offsetParent),
        ariaLabel: select?.getAttribute('aria-label'),
        label: label?.textContent?.trim(),
      }
    })(),
    localePreference: localStorage.getItem('cardano-technical-workshop.locale.v1'),
    heroTitle: document.querySelector('[data-i18n="hero.title"]')?.textContent?.trim(),
    unresolvedMessages: [...document.querySelectorAll('[data-i18n]')]
      .filter((element) => element.textContent?.trim() === element.dataset.i18n)
      .map((element) => element.dataset.i18n),
    readinessMessage: document.querySelector('#readinessMessage')?.textContent?.trim(),
    backend: document.querySelector('#backendReadiness')?.dataset.status,
    provider: document.querySelector('#providerReadiness')?.dataset.status,
    paymentBuildDisabled: document.querySelector('#paymentBuild')?.disabled,
    paymentSignDisabled: document.querySelector('#paymentSign')?.disabled,
    editableArtifacts: [...document.querySelectorAll('.artifact textarea:not([readonly])')].map((node) => node.id),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    progressSteps: document.querySelectorAll('#paymentPanel [data-progress-step]').length,
    activeStep: document.querySelector('#paymentPanel [data-progress-step][data-status="current"]')?.textContent?.trim(),
    readinessLabels: [...document.querySelectorAll('.readiness-list li')].map((node) => node.dataset.statusLabel),
    readinessTone: document.querySelector('#readinessMessage')?.dataset.tone,
    faucetHref: document.querySelector('#walletHelp a')?.href,
    cborNemo: (() => {
      const link = document.querySelector('.inspection-tool a')
      return {
        href: link?.href,
        visible: Boolean(link?.offsetParent),
        inlineContext: Boolean(link?.closest('p')),
        styledAsButton: link?.classList.contains('button-link') ?? false,
        target: link?.target,
        rel: link?.rel,
      }
    })(),
    paymentFieldGeometry: (() => {
      const recipient = document.querySelector('#paymentRecipient')
      const lovelace = document.querySelector('#paymentLovelace')
      const recipientLabel = recipient?.closest('label')
      const lovelaceLabel = lovelace?.closest('label')
      const rect = (node) => node ? { top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height } : null
      return { recipient: rect(recipient), lovelace: rect(lovelace), recipientLabel: rect(recipientLabel), lovelaceLabel: rect(lovelaceLabel) }
    })(),
    eacMetadataKeys: Object.keys(JSON.parse(document.querySelector('#eacMintMetadataJson')?.value ?? '{}')).sort(),
    technicalLog: {
      buttonLabel: document.querySelector('#technicalLogButton')?.getAttribute('aria-label'),
      badgeHidden: document.querySelector('#technicalLogBadge')?.hidden,
      dialogOpen: document.querySelector('#technicalLogDialog')?.open,
      debugIcon: Boolean(document.querySelector('#technicalLogButton .debug-icon')),
      fontFamily: getComputedStyle(document.querySelector('#log')).fontFamily,
    },
    multisigSetupAcknowledgement: Boolean(document.querySelector('#multisigSetupAcknowledge')),
    stepCode: {
      paymentStepCount: document.querySelectorAll('#paymentPanel .step-code-button').length,
      paymentStepsEnabled: [...document.querySelectorAll('#paymentPanel .step-code-button')].every((button) => !button.disabled),
      labels: [...new Set([...document.querySelectorAll('.step-code-button')].map((button) => button.textContent.trim()))],
      dialogOpen: document.querySelector('#stepCodeDialog')?.open,
    },
  }))()`)

  const backendReadinessPayload = await evaluate(cdp, `fetch('/api/readiness', {
    headers: { 'Accept-Language': 'pt-BR' },
  }).then((response) => response.json())`)
  const expectedProvider = providerPresentation(backendReadinessPayload.provider)
  const backendNetwork = backendReadinessPayload.network

  assert.equal(desktop.title, "Cardano Technical Workshop")
  assert.match(desktop.navigatorLanguage, /^en/i)
  assert.equal(desktop.htmlLang, "pt-BR")
  assert.deepEqual(desktop.selector, { value: "pt-BR", visible: true, ariaLabel: "Idioma", label: "Idioma" })
  assert.equal(desktop.localePreference, null)
  assert.equal(desktop.heroTitle, "Workbench de transações Cardano")
  assert.deepEqual(desktop.unresolvedMessages, [])
  assert.equal(desktop.readinessMessage, expectedProvider.readiness.pt)
  assert.equal(desktop.backend, "ready")
  assert.equal(desktop.provider, expectedProvider.status)
  assert.equal(desktop.paymentBuildDisabled, true)
  assert.equal(desktop.paymentSignDisabled, true)
  assert.deepEqual(desktop.editableArtifacts, ["multisigUnlockUnsigned", "multisigUnlockWitnessB"])
  assert.equal(desktop.horizontalOverflow, false)
  assert.equal(desktop.progressSteps, 5)
  assert.match(desktop.activeStep, /Construir/)
  assert.equal(desktop.readinessLabels.every(Boolean), true)
  assert.equal(desktop.readinessTone, expectedProvider.tone)
  assert.match(desktop.faucetHref, /^https:\/\/docs\.cardano\.org\/cardano-testnets\/tools\/faucet/)
  assert.deepEqual(desktop.cborNemo, {
    href: "https://cbor.nemo157.com/",
    visible: true,
    inlineContext: true,
    styledAsButton: false,
    target: "_blank",
    rel: "noreferrer",
  })
  assert.ok(Math.abs(desktop.paymentFieldGeometry.recipient.top - desktop.paymentFieldGeometry.lovelace.top) <= 1)
  assert.ok(Math.abs(desktop.paymentFieldGeometry.recipient.height - desktop.paymentFieldGeometry.lovelace.height) <= 1)
  assert.ok(Math.abs(desktop.paymentFieldGeometry.recipientLabel.height - desktop.paymentFieldGeometry.lovelaceLabel.height) <= 1)
  assert.deepEqual(desktop.eacMetadataKeys, ["assurance_hash", "decimals", "evidence_root", "methodology_hash", "unit", "version"])
  assert.deepEqual(desktop.technicalLog, {
    buttonLabel: "Abrir log técnico",
    badgeHidden: true,
    dialogOpen: false,
    debugIcon: true,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  })
  assert.equal(desktop.multisigSetupAcknowledgement, true)
  assert.deepEqual(desktop.stepCode, {
    paymentStepCount: 5,
    paymentStepsEnabled: true,
    labels: ["Ver código"],
    dialogOpen: false,
  })

  assert.deepEqual(backendNetwork, {
    name: "preprod",
    networkId: 0,
    explorerTransactionBaseUrl: "https://preprod.cardanoscan.io/transaction/",
  })

  const exerciseNavigation = await evaluate(cdp, `(async () => {
    const active = () => [...document.querySelectorAll('.exercise-nav a[aria-current="location"]')]
      .map((link) => link.getAttribute('href'))
    const states = { initial: active() }
    for (const [name, selector] of [['multisig', '#multisigExercise'], ['eac', '#eacMintPanel'], ['payment', '#paymentPanel']]) {
      document.querySelector(selector).scrollIntoView({ behavior: 'instant', block: 'start' })
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      states[name] = active()
    }
    return states
  })()`)
  assert.deepEqual(exerciseNavigation, {
    initial: ["#paymentPanel"],
    multisig: ["#multisigExercise"],
    eac: ["#eacMintPanel"],
    payment: ["#paymentPanel"],
  })

  const codeDialog = await evaluate(cdp, `(async () => {
    const sessionBefore = sessionStorage.getItem('cardano-technical-workshop.session.v1')
    const launcher = document.querySelector('[data-step-code-flow="payment"][data-step-code-index="1"]')
    launcher.click()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const dialog = document.querySelector('#stepCodeDialog')
    const source = dialog.querySelector('.step-code-excerpt .step-code-source')
    const code = dialog.querySelector('.step-code-excerpt code')
    const result = {
      open: dialog.open,
      activeElement: document.activeElement?.id,
      title: document.querySelector('#stepCodeTitle')?.textContent?.trim(),
      source: source?.textContent?.trim(),
      sourceKind: source?.tagName,
      sourceLocal: source?.dataset.local,
      sourceLabel: source?.getAttribute('aria-label'),
      sourceHref: source?.href,
      codeLength: code?.textContent?.length ?? 0,
      highlightedTokens: code?.querySelectorAll('[class^="hljs-"]').length ?? 0,
      codeStartsWithExport: code?.textContent?.trimStart().startsWith('export const buildPaymentTx') ?? false,
      sessionUnchanged: sessionStorage.getItem('cardano-technical-workshop.session.v1') === sessionBefore,
    }
    const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }))
    document.querySelector('#stepCodeClose').click()
    await closed
    return { ...result, focusReturned: document.activeElement === launcher }
  })()`)
  assert.equal(codeDialog.open, true)
  assert.equal(codeDialog.activeElement, "stepCodeClose")
  assert.equal(codeDialog.title, "Pagamento simples: Construir")
  assert.match(codeDialog.source, /^packages\/cardano\/src\/workshop\/01-payment\.ts:\d+-\d+$/)
  if (expectedSourceRevision) {
    assert.equal(codeDialog.sourceKind, "A")
    assert.equal(codeDialog.sourceLocal, undefined)
    assert.match(codeDialog.sourceLabel, /^Abrir packages\/cardano\/src\/workshop\/01-payment\.ts, linhas \d+ a \d+, no GitHub$/)
    assert.match(
      codeDialog.sourceHref,
      new RegExp(`^https://github\\.com/linconvidal/cardano-technical-workshop/blob/${expectedSourceRevision}/`),
    )
  } else {
    assert.equal(codeDialog.sourceKind, "SPAN")
    assert.equal(codeDialog.sourceLocal, "true")
    assert.match(codeDialog.sourceLabel, /alterações sem commit/)
    assert.equal(codeDialog.sourceHref, undefined)
  }
  assert.ok(codeDialog.codeLength > 80)
  assert.ok(codeDialog.highlightedTokens > 5)
  assert.equal(codeDialog.codeStartsWithExport, true)
  assert.equal(codeDialog.sessionUnchanged, true)
  assert.equal(codeDialog.focusReturned, true)

  const beforeLanguageSwitch = await evaluate(cdp, `(() => {
    const recipient = document.querySelector('#paymentRecipient')
    recipient.value = 'addr_test1smoke'
    recipient.dispatchEvent(new Event('input', { bubbles: true }))
    window.__localeSmokeMarker = 'survived'
    return {
      input: recipient.value,
      progress: [...document.querySelectorAll('#paymentPanel [data-progress-step]')].map((node) => node.dataset.status),
      artifacts: [...document.querySelectorAll('#paymentPanel .artifact textarea')].map((node) => node.value),
      session: sessionStorage.getItem('cardano-technical-workshop.session.v1'),
    }
  })()`)
  assert.ok(beforeLanguageSwitch.session)

  const english = await evaluate(cdp, `(async () => {
    const selector = document.querySelector('#languageSelector')
    selector.value = 'en'
    selector.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    return {
      marker: window.__localeSmokeMarker,
      htmlLang: document.documentElement.lang,
      selectorValue: selector.value,
      selectorLabel: document.querySelector('label[for="languageSelector"]')?.textContent?.trim(),
      selectorAriaLabel: selector.getAttribute('aria-label'),
      localePreference: localStorage.getItem('cardano-technical-workshop.locale.v1'),
      heroTitle: document.querySelector('[data-i18n="hero.title"]')?.textContent?.trim(),
      readinessMessage: document.querySelector('#readinessMessage')?.textContent?.trim(),
      activeStep: document.querySelector('#paymentPanel [data-progress-step][data-status="current"]')?.textContent?.trim(),
      technicalLogLabel: document.querySelector('#technicalLogButton')?.getAttribute('aria-label'),
      stepCodeLabel: document.querySelector('.step-code-button')?.textContent?.trim(),
      walletStatus: document.querySelector('#connectedAddress')?.textContent?.trim(),
      announcement: document.querySelector('[data-i18n-language-announcer]')?.textContent,
      input: document.querySelector('#paymentRecipient')?.value,
      progress: [...document.querySelectorAll('#paymentPanel [data-progress-step]')].map((node) => node.dataset.status),
      artifacts: [...document.querySelectorAll('#paymentPanel .artifact textarea')].map((node) => node.value),
      session: sessionStorage.getItem('cardano-technical-workshop.session.v1'),
    }
  })()`)
  assert.equal(english.marker, "survived")
  assert.equal(english.htmlLang, "en")
  assert.equal(english.selectorValue, "en")
  assert.equal(english.selectorLabel, "Language")
  assert.equal(english.selectorAriaLabel, "Language")
  assert.equal(english.localePreference, "en")
  assert.equal(english.heroTitle, "Cardano transaction Workbench")
  assert.equal(english.readinessMessage, expectedProvider.readiness.en)
  assert.match(english.activeStep, /Build/)
  assert.equal(english.technicalLogLabel, "Open technical log")
  assert.equal(english.stepCodeLabel, "Show code")
  assert.equal(english.walletStatus, "No wallet connected.")
  assert.equal(english.announcement, "Language changed to English.")
  assert.equal(english.input, beforeLanguageSwitch.input)
  assert.deepEqual(english.progress, beforeLanguageSwitch.progress)
  assert.deepEqual(english.artifacts, beforeLanguageSwitch.artifacts)
  assert.equal(english.session, beforeLanguageSwitch.session)

  const openedLog = await evaluate(cdp, `(() => {
    document.querySelector('#technicalLogButton').click()
    const dialog = document.querySelector('#technicalLogDialog')
    const badge = document.querySelector('#technicalLogBadge')
    return {
      open: dialog.open,
      activeElement: document.activeElement?.id,
      badgeHidden: badge.hidden,
      entryCount: document.querySelectorAll('#log .log-entry').length,
    }
  })()`)
  assert.deepEqual(openedLog, {
    open: true,
    activeElement: "technicalLogClose",
    badgeHidden: true,
    entryCount: 0,
  })

  const closedLog = await evaluate(cdp, `(async () => {
    const dialog = document.querySelector('#technicalLogDialog')
    const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }))
    document.querySelector('#technicalLogClose').click()
    await closed
    return { open: dialog.open, activeElement: document.activeElement?.id }
  })()`)
  assert.deepEqual(closedLog, { open: false, activeElement: "technicalLogButton" })

  const englishLayouts = []
  for (const viewport of [
    { width: 1280, height: 900, mobile: false },
    { width: 390, height: 844, mobile: true },
    { width: 320, height: 720, mobile: true },
  ]) englishLayouts.push(await checkViewport(cdp, viewport))

  const englishReloadUrl = reloadUrl("english")
  await cdp.send("Page.navigate", { url: englishReloadUrl })
  await waitForReload(cdp, englishReloadUrl)
  await waitForWorkbench(cdp)
  const reloaded = await evaluate(cdp, `(() => ({
    marker: window.__localeSmokeMarker,
    htmlLang: document.documentElement.lang,
    selectorValue: document.querySelector('#languageSelector')?.value,
    selectorLabel: document.querySelector('#languageSelector')?.getAttribute('aria-label'),
    localePreference: localStorage.getItem('cardano-technical-workshop.locale.v1'),
    sessionPresent: Boolean(sessionStorage.getItem('cardano-technical-workshop.session.v1')),
    resumeVisible: Boolean(document.querySelector('#resumeBanner')?.offsetParent),
    resumeText: document.querySelector('#resumeBanner strong')?.textContent?.trim(),
    walletStatus: document.querySelector('#connectedAddress')?.textContent?.trim(),
  }))()`)
  assert.equal(reloaded.marker, undefined)
  assert.equal(reloaded.htmlLang, "en")
  assert.equal(reloaded.selectorValue, "en")
  assert.equal(reloaded.selectorLabel, "Language")
  assert.equal(reloaded.localePreference, "en")
  assert.equal(reloaded.sessionPresent, true)
  assert.equal(reloaded.resumeVisible, true)
  assert.equal(reloaded.resumeText, "A session from this tab can be continued.")
  assert.equal(reloaded.walletStatus, "No wallet connected.")
  reloaded.apiRequest = lastApiRequest(observedApiRequests, "en")
  assert.equal(reloaded.apiRequest?.acceptLanguage, "en")

  const restoredCompletion = await evaluate(cdp, `(async () => {
    const saved = JSON.parse(sessionStorage.getItem('cardano-technical-workshop.session.v1'))
    saved.flows.metadata = {
      ...saved.flows.metadata,
      inputFingerprint: 'legacy-empty-draft',
      notice: { key: 'flow.notice.inputsInvalidated', values: {} },
    }
    saved.flows.payment = {
      requiredWitnesses: 1,
      stage: 'included',
      inputFingerprint: 'browser-smoke-payment',
      artifacts: {
        details: '{"amount":"2000000"}',
        unsigned: '84a3008001800200a0f5f6',
        witnesses: ['a100'],
        signed: '84a3008001800200a0f5f6',
        txHash: '3da9a3b38dce0e87ca4a88f3328caac7a970cf9ac40424cde2b675768d11f11b',
      },
      inclusion: { block: 'browser-smoke-block', blockHeight: 12345, blockTime: 1700000000 },
      notice: { key: 'flow.notice.included', values: { blockHeight: 12345 } },
    }
    sessionStorage.setItem('cardano-technical-workshop.session.v1', JSON.stringify(saved))
    document.querySelector('#resumeSession').click()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const navLink = document.querySelector('.exercise-nav a[href="#paymentPanel"]')
    const completion = document.querySelector('#paymentCompletion')
    const unreadBefore = document.querySelectorAll('#paymentPanel .artifact[data-unread="true"]').length
    document.querySelector('#paymentDetails').closest('.artifact').open = true
    await new Promise((resolve) => requestAnimationFrame(resolve))
    return {
      input: document.querySelector('#paymentRecipient')?.value,
      navComplete: navLink?.dataset.complete,
      navHasCheck: Boolean(navLink?.querySelector('.exercise-nav-check')),
      navCompleteLabelHidden: navLink?.querySelector('.exercise-nav-complete-label')?.hidden,
      completionHidden: completion?.hidden,
      completionKind: completion?.dataset.completionKind,
      completionLabel: completion?.querySelector('.completion-label')?.textContent?.trim(),
      completionMessage: completion?.querySelector('.completion-message')?.textContent?.trim(),
      unreadBefore,
      unreadAfterOpeningOne: document.querySelectorAll('#paymentPanel .artifact[data-unread="true"]').length,
      resetHasIcon: Boolean(document.querySelector('#paymentReset svg')),
      resetLabel: document.querySelector('#paymentReset span')?.textContent?.trim(),
      cardanoscanHasIcon: Boolean(document.querySelector('#paymentExplorer svg')),
      cardanoscanLabel: document.querySelector('#paymentExplorer span')?.textContent?.trim(),
      cardanoscanHref: document.querySelector('#paymentExplorer')?.href,
      metadataStatus: document.querySelector('#metadataStatus')?.textContent?.trim(),
    }
  })()`)
  assert.deepEqual(restoredCompletion, {
    input: "addr_test1smoke",
    navComplete: "true",
    navHasCheck: true,
    navCompleteLabelHidden: false,
    completionHidden: false,
    completionKind: "exercise",
    completionLabel: "Exercise complete",
    completionMessage: "The transaction was included in a Preprod block. Verify the destination, amount, and fee on Cardanoscan.",
    unreadBefore: 5,
    unreadAfterOpeningOne: 4,
    resetHasIcon: true,
    resetLabel: "Reset exercise",
    cardanoscanHasIcon: true,
    cardanoscanLabel: "View on Cardanoscan",
    cardanoscanHref: "https://preprod.cardanoscan.io/transaction/3da9a3b38dce0e87ca4a88f3328caac7a970cf9ac40424cde2b675768d11f11b",
    metadataStatus: expectedProvider.flowStatus.en,
  })

  const portuguese = await evaluate(cdp, `(async () => {
    const sessionBefore = sessionStorage.getItem('cardano-technical-workshop.session.v1')
    const selector = document.querySelector('#languageSelector')
    window.__localeSmokeMarker = 'portuguese-no-reload'
    selector.value = 'pt-BR'
    selector.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const sessionUnchanged = sessionStorage.getItem('cardano-technical-workshop.session.v1') === sessionBefore
    return {
      marker: window.__localeSmokeMarker,
      htmlLang: document.documentElement.lang,
      selectorValue: selector.value,
      selectorLabel: selector.getAttribute('aria-label'),
      localePreference: localStorage.getItem('cardano-technical-workshop.locale.v1'),
      heroTitle: document.querySelector('[data-i18n="hero.title"]')?.textContent?.trim(),
      stepCodeLabel: document.querySelector('.step-code-button')?.textContent?.trim(),
      completionLabel: document.querySelector('#paymentCompletion .completion-label')?.textContent?.trim(),
      navCompletionLabel: document.querySelector('.exercise-nav a[href="#paymentPanel"] .exercise-nav-complete-label')?.textContent?.trim(),
      resetLabel: document.querySelector('#paymentReset span')?.textContent?.trim(),
      announcement: document.querySelector('[data-i18n-language-announcer]')?.textContent,
      sessionUnchanged,
    }
  })()`)
  assert.equal(portuguese.marker, "portuguese-no-reload")
  assert.equal(portuguese.htmlLang, "pt-BR")
  assert.equal(portuguese.selectorValue, "pt-BR")
  assert.equal(portuguese.selectorLabel, "Idioma")
  assert.equal(portuguese.localePreference, "pt-BR")
  assert.equal(portuguese.heroTitle, "Workbench de transações Cardano")
  assert.equal(portuguese.stepCodeLabel, "Ver código")
  assert.equal(portuguese.completionLabel, "Exercício concluído")
  assert.equal(portuguese.navCompletionLabel, "Concluído")
  assert.equal(portuguese.resetLabel, "Reiniciar exercício")
  assert.equal(portuguese.announcement, "Idioma alterado para português do Brasil.")
  assert.equal(portuguese.sessionUnchanged, true)

  const resetCompletion = await evaluate(cdp, `(async () => {
    window.confirm = () => true
    document.querySelector('#paymentReset').click()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const link = document.querySelector('.exercise-nav a[href="#paymentPanel"]')
    return {
      navComplete: link?.dataset.complete,
      navIndex: link?.firstElementChild?.textContent?.trim(),
      navHasCheck: Boolean(link?.querySelector('.exercise-nav-check')),
      completionHidden: document.querySelector('#paymentCompletion')?.hidden,
      unreadArtifacts: document.querySelectorAll('#paymentPanel .artifact[data-unread="true"]').length,
    }
  })()`)
  assert.deepEqual(resetCompletion, {
    navIndex: "1",
    navHasCheck: false,
    completionHidden: true,
    unreadArtifacts: 0,
  })

  const portugueseReloadUrl = reloadUrl("portuguese")
  await cdp.send("Page.navigate", { url: portugueseReloadUrl })
  await waitForReload(cdp, portugueseReloadUrl)
  await waitForWorkbench(cdp)
  portuguese.apiRequest = lastApiRequest(observedApiRequests, "pt-BR")
  assert.equal(portuguese.apiRequest?.acceptLanguage, "pt-BR")

  const portugueseLayouts = []
  for (const viewport of [
    { width: 1280, height: 900, mobile: false },
    { width: 390, height: 844, mobile: true },
    { width: 320, height: 720, mobile: true },
  ]) portugueseLayouts.push(await checkViewport(cdp, viewport))

  const mobile = portugueseLayouts[1]
  assert.equal(mobile.clientWidth, 390)
  assert.equal(mobile.navVisible, true)
  assert.equal(mobile.navLinks, 5)
  const narrowMobile = portugueseLayouts[2]
  assert.equal(narrowMobile.clientWidth, 320)
  assert.equal(narrowMobile.navLinks, 5)

  const narrowModal = await evaluate(cdp, `(async () => {
    const dialog = document.querySelector('#technicalLogDialog')
    document.querySelector('#technicalLogButton').click()
    const closeButton = document.querySelector('#technicalLogClose')
    const dialogRect = dialog.getBoundingClientRect()
    const closeRect = closeButton.getBoundingClientRect()
    const closed = new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }))
    closeButton.click()
    await closed
    return {
      dialogWidth: dialogRect.width,
      dialogHeight: dialogRect.height,
      closeWidth: closeRect.width,
      closeHeight: closeRect.height,
    }
  })()`)
  assert.ok(narrowModal.dialogWidth <= 300)
  assert.ok(narrowModal.dialogHeight <= 700)
  assert.ok(narrowModal.closeWidth <= 90)
  assert.ok(narrowModal.closeHeight <= 48)

  const narrowCodeModal = await evaluate(cdp, `(async () => {
    const launcher = document.querySelector('[data-step-code-flow="eacMint"][data-step-code-index="1"]')
    launcher.click()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const dialog = document.querySelector('#stepCodeDialog')
    const pre = dialog.querySelector('pre')
    const dialogRect = dialog.getBoundingClientRect()
    const closeRect = document.querySelector('#stepCodeClose').getBoundingClientRect()
    dialog.scrollTop = dialog.scrollHeight
    const verticalMaximum = Math.max(0, dialog.scrollHeight - dialog.clientHeight)
    const result = {
      dialogWidth: dialogRect.width,
      dialogHeight: dialogRect.height,
      closeWidth: closeRect.width,
      closeHeight: closeRect.height,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      codeFitsWidth: pre.scrollWidth <= pre.clientWidth + 1,
      codeHasNoNestedVerticalClip: pre.scrollHeight <= pre.clientHeight + 1,
      verticalEndReached: Math.abs(dialog.scrollTop - verticalMaximum) <= 1,
    }
    dialog.close()
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return result
  })()`)
  assert.ok(narrowCodeModal.dialogWidth <= 300)
  assert.ok(narrowCodeModal.dialogHeight <= 700)
  assert.ok(narrowCodeModal.closeWidth <= 90)
  assert.ok(narrowCodeModal.closeHeight <= 48)
  assert.equal(narrowCodeModal.pageOverflow, false)
  assert.equal(narrowCodeModal.codeFitsWidth, true)
  assert.equal(narrowCodeModal.codeHasNoNestedVerticalClip, true)
  assert.equal(narrowCodeModal.verticalEndReached, true)

  await evaluate(cdp, "document.querySelector('#paymentRecipient').focus(); document.activeElement.id")
  const focused = await evaluate(cdp, `(() => {
    const element = document.activeElement
    const style = getComputedStyle(element)
    return {
      id: element?.id,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    }
  })()`)
  assert.equal(focused.id, "paymentRecipient")
  assert.equal(focused.outlineColor, "rgb(39, 39, 39)")
  assert.equal(focused.outlineWidth, "2px")
  assert.equal(focused.boxShadow, "none")

  const freshMetadataInput = await evaluate(cdp, `(async () => {
    const recipient = document.querySelector('#metadataRecipient')
    recipient.value = 'addr_test1fresh'
    recipient.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return {
      stage: document.querySelector('#metadataPanel')?.dataset.stage,
      status: document.querySelector('#metadataStatus')?.textContent?.trim(),
      artifactsEmpty: [...document.querySelectorAll('#metadataPanel .artifact textarea')]
        .every((artifact) => artifact.value === ''),
    }
  })()`)
  assert.deepEqual(freshMetadataInput, {
    stage: "draft",
    status: expectedProvider.flowStatus.pt,
    artifactsEmpty: true,
  })

  const emptyCopyFailure = await evaluate(cdp, `(async () => {
    const button = document.querySelector('[data-copy-target="paymentDetails"]')
    button.click()
    for (let attempt = 0; attempt < 20 && button.dataset.copyState !== 'failed'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    return {
      copyState: button.dataset.copyState,
      title: button.title,
      copyIcon: getComputedStyle(button.querySelector('.copy-button-icon')).display,
      errorIcon: getComputedStyle(button.querySelector('.copy-button-error-icon')).display,
      liveMessage: document.querySelector('#clipboardStatus')?.textContent?.trim(),
    }
  })()`)
  assert.deepEqual(emptyCopyFailure, {
    copyState: "failed",
    title: "Falhou",
    copyIcon: "none",
    errorIcon: "block",
    liveMessage: "Copiar Detalhes da construção: falhou. Este artefato ainda está vazio",
  })
  assert.deepEqual(browserProblems, [])

  console.log(JSON.stringify({
    desktop,
    backendNetwork,
    exerciseNavigation,
    codeDialog,
    beforeLanguageSwitch: { ...beforeLanguageSwitch, session: "[captured]" },
    english: { ...english, session: "[captured]" },
    openedLog,
    closedLog,
    englishLayouts,
    reloaded,
    restoredCompletion,
    portuguese,
    resetCompletion,
    portugueseLayouts,
    narrowModal,
    narrowCodeModal,
    focused,
    freshMetadataInput,
    emptyCopyFailure,
  }, null, 2))
  cdp.close()
} finally {
  chrome.kill("SIGTERM")
  await waitForExit(chrome, 5_000)
  if (chrome.exitCode === null) chrome.kill("SIGKILL")
  spawnSync("gio", ["trash", profileDirectory])
}

function providerPresentation(provider) {
  if (!provider?.configured) {
    return {
      status: "error",
      tone: "error",
      readiness: {
        pt: "Configure BLOCKFROST_PROJECT_ID no backend e reinicie a Workbench.",
        en: "Configure BLOCKFROST_PROJECT_ID in the backend and restart the Workbench.",
      },
      flowStatus: {
        pt: "Aguarde: o backend e o Blockfrost Preprod precisam estar prontos antes de construir.",
        en: "Wait until the backend and Blockfrost Preprod are ready before building.",
      },
    }
  }

  if (!provider.healthy) {
    return {
      status: "warning",
      tone: "error",
      readiness: {
        pt: "O Blockfrost Preprod está indisponível. Seus campos e artefatos continuam nesta aba; aguarde e tente novamente.",
        en: "Blockfrost Preprod is unavailable. Your fields and artifacts remain in this tab; wait and try again.",
      },
      flowStatus: {
        pt: "Aguarde: o backend e o Blockfrost Preprod precisam estar prontos antes de construir.",
        en: "Wait until the backend and Blockfrost Preprod are ready before building.",
      },
    }
  }

  return {
    status: "ready",
    tone: "info",
    readiness: {
      pt: "Backend pronto. Conecte uma wallet configurada em Preprod.",
      en: "Backend ready. Connect a wallet configured for Preprod.",
    },
    flowStatus: {
      pt: "Próximo passo: conecte uma wallet CIP-30 na seção de prontidão.",
      en: "Next step: connect a CIP-30 wallet in the readiness section.",
    },
  }
}

function lastApiRequest(requests, locale) {
  return [...requests].reverse().find((request) => request.acceptLanguage === locale)
}

async function checkViewport(cdp, { width, height, mobile }) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  })
  await evaluate(cdp, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
  const layout = await evaluate(cdp, `(() => {
    const nav = document.querySelector('.exercise-nav')
    return {
      locale: document.documentElement.lang,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      navVisible: Boolean(nav?.offsetParent),
      navHorizontalOverflow: nav ? nav.scrollWidth > nav.clientWidth : true,
      navLinks: nav?.querySelectorAll('a').length ?? 0,
    }
  })()`)
  assert.equal(layout.clientWidth, width)
  assert.equal(layout.horizontalOverflow, false)
  assert.equal(layout.navVisible, true)
  assert.equal(layout.navHorizontalOverflow, false)
  assert.equal(layout.navLinks, 5)

  const accessibility = await cdp.send("Accessibility.getFullAXTree")
  const unnamedControls = accessibility.nodes.filter((node) =>
    !node.ignored &&
    ["button", "textbox", "combobox"].includes(node.role?.value) &&
    !node.name?.value,
  )
  assert.deepEqual(unnamedControls, [])
  return { ...layout, unnamedControls: unnamedControls.length }
}

async function waitForPage(port, expectedUrl) {
  const endpoint = `http://127.0.0.1:${port}/json/list`
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const targets = await fetch(endpoint).then((response) => response.json())
      const page = targets.find((target) => target.type === "page" && target.url.startsWith(expectedUrl))
      if (page) return page
    } catch {
      // Chrome is still starting.
    }
    await delay(100)
  }
  throw new Error(`Chrome DevTools did not expose ${expectedUrl}. ${stderr}`)
}

function reloadUrl(label) {
  const url = new URL(appUrl)
  url.searchParams.set("smoke-reload", `${label}-${Date.now()}`)
  return url.href
}

async function waitForReload(cdp, expectedUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const reloaded = await evaluate(cdp, `document.readyState !== 'loading' &&
        location.href === ${JSON.stringify(expectedUrl)} &&
        document.querySelectorAll('artifact-box').length === 0 &&
        Boolean(document.querySelector('#paymentDetails')) &&
        Boolean(document.querySelector('#languageSelector'))`)
      if (reloaded) return
    } catch {
      // The previous execution context is being replaced.
    }
    await delay(50)
  }
  const state = await evaluate(cdp, `({
    href: location.href,
    readyState: document.readyState,
    marker: window.__localeSmokeMarker,
    technicalLogOpen: document.querySelector('#technicalLogDialog')?.open,
    stepCodeOpen: document.querySelector('#stepCodeDialog')?.open,
  })`).catch((error) => ({ error: String(error) }))
  throw new Error(`Workbench did not reload: ${JSON.stringify({ expectedUrl, state })}`)
}

async function waitForWorkbench(cdp) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(cdp, `document.readyState !== 'loading' &&
      Boolean(document.querySelector('#backendReadiness')) &&
      document.querySelector('#backendReadiness').dataset.status !== 'checking'`)
    if (ready) return
    await delay(100)
  }
  throw new Error("Workbench did not finish its initial readiness check")
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  const pending = new Map()
  const listeners = new Map()
  let sequence = 0

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true })
    socket.addEventListener("error", reject, { once: true })
  })

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) {
      for (const listener of listeners.get(message.method) ?? []) listener(message.params ?? {})
      return
    }
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  return {
    send(method, params = {}) {
      const id = ++sequence
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    on(method, listener) {
      const values = listeners.get(method) ?? []
      values.push(listener)
      listeners.set(method, values)
    },
    close() {
      socket.close()
    },
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForExit(child, timeout) {
  if (child.exitCode !== null) return
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(timeout),
  ])
}

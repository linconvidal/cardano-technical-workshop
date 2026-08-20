import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
  cdp.on("Network.requestWillBeSent", ({ request }) => {
    if (!request?.url?.includes("/api/")) return
    const acceptLanguage = Object.entries(request.headers ?? {})
      .find(([name]) => name.toLowerCase() === "accept-language")?.[1]
    observedApiRequests.push({ url: request.url, acceptLanguage })
  })
  await cdp.send("Runtime.enable")
  await cdp.send("Page.enable")
  await cdp.send("Network.enable")
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
      return { href: link?.href, visible: Boolean(link?.offsetParent) }
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
  }))()`)

  assert.equal(desktop.title, "Cardano Technical Workshop")
  assert.match(desktop.navigatorLanguage, /^en/i)
  assert.equal(desktop.htmlLang, "pt-BR")
  assert.deepEqual(desktop.selector, { value: "pt-BR", visible: true, ariaLabel: "Idioma", label: "Idioma" })
  assert.equal(desktop.localePreference, null)
  assert.equal(desktop.heroTitle, "Workbench de transações Cardano")
  assert.equal(desktop.readinessMessage, "Configure BLOCKFROST_PROJECT_ID no backend e reinicie a Workbench.")
  assert.equal(desktop.backend, "ready")
  assert.equal(desktop.provider, "error")
  assert.equal(desktop.paymentBuildDisabled, true)
  assert.equal(desktop.paymentSignDisabled, true)
  assert.deepEqual(desktop.editableArtifacts, ["multisigUnlockUnsigned", "multisigUnlockWitnessB"])
  assert.equal(desktop.horizontalOverflow, false)
  assert.equal(desktop.progressSteps, 5)
  assert.match(desktop.activeStep, /Construir/)
  assert.equal(desktop.readinessLabels.every(Boolean), true)
  assert.equal(desktop.readinessTone, "error")
  assert.match(desktop.faucetHref, /^https:\/\/docs\.cardano\.org\/cardano-testnets\/tools\/faucet/)
  assert.equal(desktop.cborNemo.href, "https://cbor.nemo157.com/")
  assert.equal(desktop.cborNemo.visible, true)
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
  assert.equal(english.readinessMessage, "Configure BLOCKFROST_PROJECT_ID in the backend and restart the Workbench.")
  assert.match(english.activeStep, /Build/)
  assert.equal(english.technicalLogLabel, "Open technical log")
  assert.equal(english.walletStatus, "No wallet connected.")
  assert.equal(english.announcement, "Language changed to English.")
  assert.equal(english.input, beforeLanguageSwitch.input)
  assert.deepEqual(english.progress, beforeLanguageSwitch.progress)
  assert.deepEqual(english.artifacts, beforeLanguageSwitch.artifacts)
  assert.equal(english.session, beforeLanguageSwitch.session)

  const logAttention = await evaluate(cdp, `(async () => {
    const build = document.querySelector('#paymentBuild')
    build.disabled = false
    build.click()
    const badge = document.querySelector('#technicalLogBadge')
    for (let attempt = 0; attempt < 50 && badge.hidden; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const button = document.querySelector('#technicalLogButton')
    return {
      badgeHidden: badge.hidden,
      badgeText: badge.textContent,
      buttonLabel: button.getAttribute('aria-label'),
      hasErrors: button.dataset.hasErrors,
    }
  })()`)
  assert.equal(logAttention.badgeHidden, false)
  assert.equal(logAttention.badgeText, "1")
  assert.equal(logAttention.buttonLabel, "Open technical log, 1 unread error")
  assert.equal(logAttention.hasErrors, "true")

  const openedLog = await evaluate(cdp, `(() => {
    document.querySelector('#technicalLogButton').click()
    const dialog = document.querySelector('#technicalLogDialog')
    const badge = document.querySelector('#technicalLogBadge')
    return {
      open: dialog.open,
      activeElement: document.activeElement?.id,
      badgeHidden: badge.hidden,
      hasErrorEntry: Boolean(document.querySelector('#log .log-entry[data-level="error"]')),
      logText: document.querySelector('#log').textContent,
    }
  })()`)
  assert.equal(openedLog.open, true)
  assert.equal(openedLog.activeElement, "technicalLogClose")
  assert.equal(openedLog.badgeHidden, true)
  assert.equal(openedLog.hasErrorEntry, true)
  assert.match(openedLog.logText, /Flow payment: the step failed\./)

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

  await cdp.send("Page.reload", { ignoreCache: true })
  await waitForReload(cdp)
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

  const restoredInput = await evaluate(cdp, `(() => {
    document.querySelector('#resumeSession').click()
    return document.querySelector('#paymentRecipient')?.value
  })()`)
  assert.equal(restoredInput, "addr_test1smoke")

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
  assert.equal(portuguese.announcement, "Idioma alterado para português do Brasil.")
  assert.equal(portuguese.sessionUnchanged, true)

  await cdp.send("Page.reload", { ignoreCache: true })
  await waitForReload(cdp)
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

  console.log(JSON.stringify({
    desktop,
    beforeLanguageSwitch: { ...beforeLanguageSwitch, session: "[captured]" },
    english: { ...english, session: "[captured]" },
    logAttention,
    openedLog: { ...openedLog, logText: "[captured]" },
    closedLog,
    englishLayouts,
    reloaded,
    portuguese,
    portugueseLayouts,
    narrowModal,
    focused,
  }, null, 2))
  cdp.close()
} finally {
  chrome.kill("SIGTERM")
  await waitForExit(chrome, 5_000)
  if (chrome.exitCode === null) chrome.kill("SIGKILL")
  spawnSync("gio", ["trash", profileDirectory])
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

async function waitForReload(cdp) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const reloaded = await evaluate(cdp, "document.readyState === 'complete' && window.__localeSmokeMarker === undefined")
      if (reloaded) return
    } catch {
      // The previous execution context is being replaced.
    }
    await delay(50)
  }
  throw new Error("Workbench did not reload")
}

async function waitForWorkbench(cdp) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await evaluate(cdp, `document.readyState === 'complete' &&
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

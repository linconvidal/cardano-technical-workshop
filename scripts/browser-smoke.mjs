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
  await cdp.send("Runtime.enable")
  await cdp.send("Page.enable")
  await cdp.send("Accessibility.enable")
  await waitForWorkbench(cdp)

  const desktop = await evaluate(cdp, `(() => ({
    title: document.title,
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
    multisigSetupAcknowledgement: Boolean(document.querySelector('#multisigSetupAcknowledge')),
  }))()`)

  assert.equal(desktop.title, "Cardano Technical Workshop")
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
  assert.equal(desktop.multisigSetupAcknowledgement, true)

  const accessibility = await cdp.send("Accessibility.getFullAXTree")
  const unnamedControls = accessibility.nodes.filter((node) =>
    !node.ignored &&
    ["button", "textbox", "combobox"].includes(node.role?.value) &&
    !node.name?.value,
  )
  assert.deepEqual(unnamedControls, [])

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await evaluate(cdp, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
  const mobile = await evaluate(cdp, `(() => {
    const nav = document.querySelector('.exercise-nav')
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      navVisible: Boolean(nav),
      navHorizontalOverflow: nav ? nav.scrollWidth > nav.clientWidth : true,
      navLinks: nav?.querySelectorAll('a').length ?? 0,
    }
  })()`)
  assert.equal(mobile.clientWidth, 390)
  assert.equal(mobile.horizontalOverflow, false)
  assert.equal(mobile.navVisible, true)
  assert.equal(mobile.navHorizontalOverflow, false)
  assert.equal(mobile.navLinks, 5)

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 720,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await evaluate(cdp, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
  const narrowMobile = await evaluate(cdp, `(() => {
    const nav = document.querySelector('.exercise-nav')
    return {
      clientWidth: document.documentElement.clientWidth,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      navHorizontalOverflow: nav ? nav.scrollWidth > nav.clientWidth : true,
      navLinks: nav?.querySelectorAll('a').length ?? 0,
    }
  })()`)
  assert.equal(narrowMobile.clientWidth, 320)
  assert.equal(narrowMobile.horizontalOverflow, false)
  assert.equal(narrowMobile.navHorizontalOverflow, false)
  assert.equal(narrowMobile.navLinks, 5)

  await evaluate(cdp, "document.querySelector('#paymentRecipient').focus(); document.activeElement.id")
  const focused = await evaluate(cdp, `(() => {
    const element = document.activeElement
    const style = getComputedStyle(element)
    return { id: element?.id, outlineColor: style.outlineColor, boxShadow: style.boxShadow }
  })()`)
  assert.equal(focused.id, "paymentRecipient")
  assert.equal(focused.outlineColor, "rgb(39, 39, 39)")
  assert.match(focused.boxShadow, /rgb\(0, 132, 255\)/)

  console.log(JSON.stringify({ desktop, mobile, narrowMobile, focused, unnamedControls: unnamedControls.length }, null, 2))
  cdp.close()
} finally {
  chrome.kill("SIGTERM")
  await waitForExit(chrome, 5_000)
  if (chrome.exitCode === null) chrome.kill("SIGKILL")
  spawnSync("gio", ["trash", profileDirectory])
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

async function waitForWorkbench(cdp) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
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
  let sequence = 0

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true })
    socket.addEventListener("error", reject, { once: true })
  })

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
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

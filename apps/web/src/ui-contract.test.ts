import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8")
const server = readFileSync(new URL("../../api/src/server.ts", import.meta.url), "utf8")
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8")
const technicalLog = readFileSync(new URL("./technical-log.ts", import.meta.url), "utf8")
const flows = readFileSync(new URL("./workbench-flows.ts", import.meta.url), "utf8")
const feature = readFileSync(new URL("../../../features/participant-led-workbench.feature", import.meta.url), "utf8")

test("participant page exposes readiness, session recovery, and ordered flow controls", () => {
  for (const id of [
    "readinessPanel",
    "resumeBanner",
    "paymentPanel",
    "metadataPanel",
    "multisigExercise",
    "eacMintPanel",
    "mintPanel",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`))
  }

  for (const flow of ["payment", "metadata", "multisigLock", "multisigUnlock", "eacMint", "eacRetire", "mint"]) {
    for (const suffix of ["Build", "Sign", "Merge", "Submit", "Check", "Retry", "Reset", "Status", "Alert", "Acknowledge"]) {
      assert.match(html, new RegExp(`id="${flow}${suffix}"`), `${flow}${suffix} must exist`)
    }
  }
})

test("multisig, EAC raw mint, and CIP-25 mint appear in order", () => {
  assert.ok(html.indexOf("id=\"multisigExercise\"") < html.indexOf("id=\"eacMintPanel\""))
  assert.ok(html.indexOf("id=\"eacMintPanel\"") < html.indexOf("id=\"mintPanel\""))

  const editableTargets = [...html.matchAll(/<artifact-box[^>]*target="([^"]+)"[^>]*editable/g)].map((match) => match[1])
  assert.deepEqual(editableTargets, ["multisigUnlockUnsigned", "multisigUnlockWitnessB"])
})

test("exercise order uses canonical routes while preserving old aliases", () => {
  assert.match(flows, /\/03-multisig\/lock/)
  assert.match(flows, /\/04a-mint-eac/)
  assert.match(flows, /\/04a-retire-eac/)
  assert.match(flows, /\/04b-mint-cip25/)
  for (const route of ["04b-mint-cip25", "04-mint-cip25", "03-mint-cip25"]) {
    assert.match(server, new RegExp(`/api/workshop/${route}`))
  }
  assert.match(server, /\["\/api\/workshop\/03-multisig", "\/api\/workshop\/04-multisig"\]/)
})

test("EAC metadata fixture follows the exact ADR schema without accounting duplication", () => {
  const match = html.match(/id="eacMintMetadataJson"[^>]*>([\s\S]*?)<\/textarea>/)
  assert.ok(match)
  const metadata = JSON.parse(match[1])
  assert.deepEqual(Object.keys(metadata).sort(), [
    "assurance_hash",
    "decimals",
    "evidence_root",
    "methodology_hash",
    "unit",
    "version",
  ])
  assert.equal(metadata.version, 1)
  assert.equal(metadata.unit, "EAC")
  assert.equal(metadata.decimals, 3)
})

test("EAC retirement metadata avoids accounting duplication", () => {
  const match = html.match(/id="eacRetireMetadataJson"[^>]*>([\s\S]*?)<\/textarea>/)
  assert.ok(match)
  const metadata = JSON.parse(match[1])
  assert.deepEqual(Object.keys(metadata).sort(), [
    "declaration_hash",
    "delivery_reference_hash",
    "version",
  ])
  assert.equal(metadata.version, 1)
  assert.doesNotMatch(match[1], /quantity|asset_name|action/)
})

test("setup exposes the external CBOR inspector", () => {
  assert.match(html, /href="https:\/\/cbor\.nemo157\.com\/"/)
  assert.match(html, /target="_blank" rel="noreferrer"/)
})

test("visual tokens use the Cardano Foundation palette", () => {
  for (const color of [
    "#272727",
    "#404040",
    "#808080",
    "#C6C6C6",
    "#D9D9D9",
    "#F2F2F2",
    "#D64A2E",
    "#FEF3F1",
    "#0084FF",
    "#00E0FF",
    "#2BFFB3",
    "#00BE7A",
  ]) {
    assert.match(styles, new RegExp(color, "i"))
  }
  for (const legacyColor of ["#24211f", "#e9e6e0", "#a93620", "#7f2818", "#fffdfa", "#f4f1ec"]) {
    assert.doesNotMatch(styles, new RegExp(legacyColor, "i"))
  }
  assert.match(html, /family=JetBrains\+Mono/)
  assert.match(styles, /--font-mono: "JetBrains Mono"/)
})

test("exercise codes use a consistent monospaced tag", () => {
  const codes = [...html.matchAll(/<span class="exercise-code">([^<]+)<\/span>/g)].map((match) => match[1])
  assert.deepEqual(codes, ["1", "2", "3", "3.0", "3A", "3B", "4A", "4A.2", "4B"])
  assert.match(styles, /\.exercise-code\s*\{[\s\S]*font-family: var\(--font-mono\)/)
})

test("technical log uses an accessible modal and unread-error attention marker", () => {
  assert.match(html, /id="technicalLogButton"[^>]*aria-haspopup="dialog"[^>]*aria-controls="technicalLogDialog"/s)
  assert.match(html, /class="debug-icon"[^>]*aria-hidden="true"/)
  assert.match(html, /id="technicalLogBadge"[^>]*aria-hidden="true"[^>]*hidden/)
  assert.match(html, /<dialog id="technicalLogDialog"[^>]*aria-labelledby="technicalLogTitle"/)
  assert.match(html, /id="log"[^>]*role="log"[^>]*tabindex="0"/)
  assert.doesNotMatch(html, /diagnostic-log/)
  assert.match(technicalLog, /showModal\(\)/)
  assert.match(technicalLog, /unreadErrors \+= 1/)
  assert.match(technicalLog, /this\.launcher\.focus\(\)/)
})

test("status and failure feedback use live region semantics", () => {
  assert.match(html, /id="paymentStatus"[^>]*role="status"[^>]*aria-live="polite"/)
  assert.match(html, /id="paymentAlert"[^>]*role="alert"[^>]*tabindex="-1"/)
  assert.match(html, /id="paymentCompletion"[^>]*role="status"/)
  assert.match(html, /id="readinessMessage"[^>]*data-tone="info"[^>]*role="status"/)
  assert.match(readFileSync(new URL("./readiness-view.ts", import.meta.url), "utf8"), /"info" \| "warning" \| "error" \| "success"/)
})

test("behavioral scenarios cover readiness, invalidation, recovery, submission, resume, and multisig", () => {
  for (const phrase of [
    "pré-requisitos",
    "Invalidar artefatos",
    "Recuperar uma assinatura recusada",
    "Distinguir submissão de inclusão",
    "Restaurar uma sessão",
    "mesma chave duas vezes",
    "vários UTxOs",
    "Signer B",
    "dois witnesses válidos",
    "metadata raw",
    "CIP-25 como exemplo separado",
    "Sinalizar erros no log técnico",
  ]) {
    assert.match(feature, new RegExp(phrase))
  }
})

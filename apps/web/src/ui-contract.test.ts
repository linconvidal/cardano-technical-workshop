import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  englishStaticMessages,
  portugueseStaticMessages,
} from "../../../packages/localization/src/catalogs/static.js"

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

test("hero exposes one compact keyboard-accessible bilingual selector with Portuguese fallback", () => {
  const hero = html.slice(html.indexOf("<header class=\"hero\">"), html.indexOf("</header>"))
  assert.equal((html.match(/id="languageSelector"/g) ?? []).length, 1)
  assert.match(hero, /<label for="languageSelector"[^>]*class="sr-only"[^>]*>Idioma<\/label>/)
  assert.match(hero, /<select[\s\S]*id="languageSelector"[\s\S]*name="language"[\s\S]*aria-label="Idioma"/)
  assert.equal((hero.match(/<option value="pt-BR"[^>]*selected>🇧🇷 PT<\/option>/g) ?? []).length, 1)
  assert.equal((hero.match(/<option value="en"[^>]*>🇬🇧 EN<\/option>/g) ?? []).length, 1)
  assert.match(html, /^<!doctype html>\s*<html lang="pt-BR">/)
  assert.match(styles, /\.language-selector\s*\{[\s\S]*position: absolute;[\s\S]*z-index: 2;/)
  assert.match(styles, /\.language-selector select\s*\{[\s\S]*min-width: 88px;[\s\S]*width: 88px;/)
})

test("declarative localization keys exist in parity across both static catalogs", () => {
  const portugueseKeys = Object.keys(portugueseStaticMessages).sort()
  const englishKeys = Object.keys(englishStaticMessages).sort()
  assert.deepEqual(englishKeys, portugueseKeys)

  const referencedKeys = [
    ...html.matchAll(/\sdata-i18n="([^"]+)"/g),
  ].map((match) => match[1])
  for (const declaration of html.matchAll(/\sdata-i18n-(?:attr|attributes)="([^"]+)"/g)) {
    for (const mapping of declaration[1].split(/[;,]/)) {
      const separator = mapping.indexOf(":")
      referencedKeys.push((separator < 0 ? mapping : mapping.slice(separator + 1)).trim())
    }
  }

  assert.ok(referencedKeys.length > 300)
  for (const key of referencedKeys) {
    assert.ok(key in portugueseStaticMessages, `Portuguese static key ${key} must exist`)
    assert.ok(key in englishStaticMessages, `English static key ${key} must exist`)
  }
})

test("translatable static attributes and artifact fallbacks expose stable mappings", () => {
  for (const tag of html.matchAll(/<[^>]+aria-label="[^"]+"[^>]*>/g)) {
    assert.match(tag[0], /data-i18n-(?:attr|attributes)="[^"]*aria-label:/)
  }
  for (const tag of html.matchAll(/<(?:input|textarea)[^>]+placeholder="[^"]+"[^>]*>/g)) {
    assert.match(tag[0], /data-i18n-(?:attr|attributes)="[^"]*placeholder:/)
  }

  const artifacts = [...html.matchAll(/<artifact-box\b[^>]*>/g)].map((match) => match[0])
  assert.equal(artifacts.length, 38)
  for (const artifact of artifacts) {
    const title = artifact.match(/title="([^"]+)"/)?.[1]
    const description = artifact.match(/description="([^"]+)"/)?.[1]
    const mapping = artifact.match(/data-i18n-(?:attr|attributes)="([^"]+)"/)?.[1]
    assert.ok(title && description && mapping)
    const keys = Object.fromEntries(mapping.split(/[;,]/).map((entry) => entry.split(":", 2)))
    assert.equal(portugueseStaticMessages[keys.title as keyof typeof portugueseStaticMessages], title)
    assert.equal(portugueseStaticMessages[keys.description as keyof typeof portugueseStaticMessages], description)
  }
})

test("bilingual static surface preserves workshop fixtures and evidence boundary", () => {
  for (const literal of [
    "674",
    "65536",
    "721",
    "EAC-BRE-2025P01",
    "12088322",
    "125000",
    "11963322",
    "12.088,322 EAC",
    "125,000 EAC",
    "11.963,322 EAC",
  ]) {
    assert.match(html, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
  for (const value of ["2000000", "10000000", "MyLittleToken", "My Little Token", "Hello, Cardano!"]) {
    assert.match(html, new RegExp(`value="${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`))
  }
  assert.equal(
    portugueseStaticMessages["eac.description"],
    "Execute um exemplo Cardano inspirado no caso Brevik. A quantidade é ilustrativa e não representa a oferta alocável publicada pela Heidelberg Materials.",
  )
  assert.equal(
    englishStaticMessages["eac.description"],
    "Run a Cardano example inspired by the Brevik case. The quantity is illustrative and does not represent the allocable supply published by Heidelberg Materials.",
  )
  assert.doesNotMatch(html, /\u2014/)
  assert.doesNotMatch(JSON.stringify(englishStaticMessages), /\u2014/)
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

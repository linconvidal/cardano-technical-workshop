import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8")
const server = readFileSync(new URL("../../api/src/server.ts", import.meta.url), "utf8")
const flows = readFileSync(new URL("./workbench-flows.ts", import.meta.url), "utf8")
const feature = readFileSync(new URL("../../../features/participant-led-workbench.feature", import.meta.url), "utf8")

test("participant page exposes readiness, session recovery, and ordered flow controls", () => {
  for (const id of [
    "readinessPanel",
    "resumeBanner",
    "paymentPanel",
    "metadataPanel",
    "multisigExercise",
    "mintPanel",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`))
  }

  for (const flow of ["payment", "metadata", "multisigLock", "multisigUnlock", "mint"]) {
    for (const suffix of ["Build", "Sign", "Merge", "Submit", "Check", "Retry", "Reset", "Status", "Alert", "Acknowledge"]) {
      assert.match(html, new RegExp(`id="${flow}${suffix}"`), `${flow}${suffix} must exist`)
    }
  }
})

test("multisig appears before mint and only handoff artifacts are editable", () => {
  assert.ok(html.indexOf("id=\"multisigExercise\"") < html.indexOf("id=\"mintPanel\""))

  const editableTargets = [...html.matchAll(/<artifact-box[^>]*target="([^"]+)"[^>]*editable/g)].map((match) => match[1])
  assert.deepEqual(editableTargets, ["multisigUnlockUnsigned", "multisigUnlockWitnessB"])
})

test("exercise order uses canonical routes while preserving old aliases", () => {
  assert.match(flows, /\/03-multisig\/lock/)
  assert.match(flows, /\/04-mint-cip25/)
  assert.match(server, /\["\/api\/workshop\/04-mint-cip25", "\/api\/workshop\/03-mint-cip25"\]/)
  assert.match(server, /\["\/api\/workshop\/03-multisig", "\/api\/workshop\/04-multisig"\]/)
})

test("status and failure feedback use live region semantics", () => {
  assert.match(html, /id="paymentStatus"[^>]*role="status"[^>]*aria-live="polite"/)
  assert.match(html, /id="paymentAlert"[^>]*role="alert"[^>]*tabindex="-1"/)
  assert.match(html, /id="paymentCompletion"[^>]*role="status"/)
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
  ]) {
    assert.match(feature, new RegExp(phrase))
  }
})

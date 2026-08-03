import assert from "node:assert/strict"
import test from "node:test"

import { snapshotInputs } from "./flow-fingerprint.js"
import {
  canRun,
  createFlowState,
  failAction,
  invalidateForInputs,
  isAcknowledged,
  prepareSubmission,
  setAcknowledged,
  setBuild,
  setImportedUnsigned,
  setIncluded,
  setMerged,
  setSubmitted,
  setWitness,
  startAction,
} from "./workbench-state.js"
import { hasProgress, parseSession, serializeSession } from "./workbench-session.js"

const ready = { walletConnected: true, canBuild: true, backendReady: true }

test("standard flow advances only in build, sign, merge, submit, include order", () => {
  let state = createFlowState()
  assert.equal(canRun(state, "build", ready), true)
  assert.equal(canRun(state, "sign", ready), false)

  state = setBuild(state, "{}", "84a100", "inputs-a")
  assert.equal(state.stage, "built")
  assert.equal(canRun(state, "sign", ready), true)
  assert.equal(canRun(state, "merge", ready), false)

  state = setWitness(state, 0, "a100")
  assert.equal(state.stage, "signed")
  state = setMerged(state, "84a100a100")
  assert.equal(canRun(state, "submit", ready), false)

  state = setAcknowledged(state, true)
  assert.equal(isAcknowledged(state), true)
  assert.equal(canRun(state, "submit", { ...ready, backendReady: false }), false)
  assert.equal(canRun(state, "submit", { ...ready, walletConnected: false }), false)
  assert.equal(canRun(state, "submit", ready), true)

  state = prepareSubmission(state, "f".repeat(64))
  assert.equal(state.stage, "submission-unknown")
  assert.equal(canRun(state, "check", ready), true)
  assert.equal(canRun(state, "submit", ready), false)
  state = { ...state, unknownStatusChecked: true }
  assert.equal(canRun(state, "submit", ready), true)

  state = setSubmitted(state, "f".repeat(64))
  assert.equal(state.stage, "submitted")
  assert.equal(canRun(state, "check", ready), true)

  state = setIncluded(state, { block: "block", blockHeight: 42, blockTime: 1_700_000_000 })
  assert.equal(state.stage, "included")
  assert.equal(canRun(state, "check", ready), false)
})

test("input mutation clears every stale downstream artifact", () => {
  let state = setBuild(createFlowState(), "details", "unsigned", "old-inputs")
  state = setWitness(state, 0, "witness")
  state = setMerged(state, "signed")
  state = setAcknowledged(state, true)

  const invalidated = invalidateForInputs(state, "new-inputs", "Campos alterados")
  assert.equal(invalidated.stage, "draft")
  assert.deepEqual(invalidated.artifacts, {
    details: "",
    unsigned: "",
    witnesses: [""],
    signed: "",
    txHash: "",
  })
  assert.equal(isAcknowledged(invalidated), false)
})

test("failed actions preserve the last stable checkpoint", () => {
  const built = setBuild(createFlowState(), "details", "unsigned", "inputs")
  const busy = startAction(built, "sign")
  const failed = failAction(busy, {
    action: "sign",
    message: "Assinatura recusada",
    guidance: "Tente novamente.",
    retryable: true,
  })

  assert.equal(failed.stage, "built")
  assert.equal(failed.artifacts.unsigned, "unsigned")
  assert.equal(failed.busyAction, undefined)
  assert.equal(failed.error?.action, "sign")
})

test("multisig requires two witnesses and supports imported unsigned CBOR", () => {
  let state = setImportedUnsigned(createFlowState(2), "84a100")
  state = setWitness(state, 0, "witness-a")
  assert.equal(state.stage, "partially-signed")
  assert.equal(canRun(state, "merge", ready), false)

  state = setWitness(state, 1, "witness-b")
  assert.equal(state.stage, "signed")
  assert.equal(canRun(state, "merge", ready), true)
})

test("session serialization clears transient busy and error state", () => {
  const inputs = { paymentRecipient: "addr_test" }
  const flow = failAction(startAction(setBuild(createFlowState(), "d", "u", "i"), "sign"), {
    action: "sign",
    message: "failure",
    guidance: "retry",
    retryable: true,
  })
  const raw = serializeSession(inputs, { payment: flow })
  const restored = parseSession(raw)

  assert.ok(restored)
  assert.equal(hasProgress(restored), true)
  assert.equal(restored.flows.payment.busyAction, undefined)
  assert.equal(restored.flows.payment.error, undefined)
  assert.equal(snapshotInputs({ b: "2", a: "1" }), snapshotInputs({ a: "1", b: "2" }))
  assert.equal(parseSession("not-json"), undefined)
  assert.equal(parseSession(JSON.stringify({ version: 2 })), undefined)
})

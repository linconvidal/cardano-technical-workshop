import assert from "node:assert/strict"
import test from "node:test"

import { runCheckAction, runSubmitAction, type FlowActionDependencies } from "./flow-actions.js"
import {
  createFlowState,
  prepareSubmission,
  setAcknowledged,
  setBuild,
  setMerged,
  setWitness,
} from "./workbench-state.js"

const expectedHash = "a".repeat(64)

const preparedState = () => {
  let state = setBuild(createFlowState(), "{}", "unsigned", "inputs")
  state = setWitness(state, 0, "witness")
  state = setMerged(state, "signed")
  state = setAcknowledged(state, true)
  return prepareSubmission(state, expectedHash)
}

const dependencies = (overrides: Partial<FlowActionDependencies>): FlowActionDependencies => ({
  build: async () => ({ txCbor: "unsigned", details: {} }),
  sign: async () => "witness",
  ...overrides,
})

test("pending inclusion keeps the deterministic hash and unknown submission state", async () => {
  const state = await runCheckAction(preparedState(), dependencies({
    checkStatus: async () => ({ status: "not-indexed" }),
  }))

  assert.equal(state.stage, "submission-unknown")
  assert.equal(state.artifacts.txHash, expectedHash)
  assert.equal(state.unknownStatusChecked, true)
  assert.match(state.notice ?? "", /não confirma nem rejeita/)
})

test("successful response must match the hash calculated from signed CBOR", async () => {
  await assert.rejects(
    () => runSubmitAction(preparedState(), dependencies({
      submit: async () => ({ txHash: "b".repeat(64) }),
    })),
    /signed CBOR calcula/,
  )

  const submitted = await runSubmitAction(preparedState(), dependencies({
    submit: async () => ({ txHash: expectedHash }),
  }))
  assert.equal(submitted.stage, "submitted")
  assert.equal(submitted.artifacts.txHash, expectedHash)
})

import assert from "node:assert/strict"
import test from "node:test"

import { createFlowState } from "./workbench-state.js"
import { parseSession, serializeSession } from "./workbench-session.js"

test("session parser rejects malformed nested flow state", () => {
  const serialized = serializeSession({ paymentLovelace: "2000000" }, { payment: createFlowState(1) })
  assert.ok(parseSession(serialized))

  const malformed = JSON.parse(serialized) as Record<string, any>
  malformed.flows.payment.artifacts.witnesses = "not-an-array"
  assert.equal(parseSession(JSON.stringify(malformed)), undefined)

  malformed.flows.payment.artifacts.witnesses = [""]
  malformed.flows.payment.stage = "invented-stage"
  assert.equal(parseSession(JSON.stringify(malformed)), undefined)

  const phantom = JSON.parse(serialized) as Record<string, any>
  phantom.flows.payment.stage = "included"
  phantom.flows.payment.inclusion = "not-an-inclusion"
  phantom.flows.payment.notice = { text: "phantom completion" }
  assert.equal(parseSession(JSON.stringify(phantom)), undefined)

  const impossibleTerminal = JSON.parse(serialized) as Record<string, any>
  impossibleTerminal.flows.payment.stage = "submitted"
  impossibleTerminal.flows.payment.artifacts.unsigned = "84"
  impossibleTerminal.flows.payment.artifacts.witnesses = ["a100"]
  impossibleTerminal.flows.payment.artifacts.signed = "00"
  impossibleTerminal.flows.payment.artifacts.txHash = "f".repeat(64)
  assert.equal(parseSession(JSON.stringify(impossibleTerminal)), undefined)
})

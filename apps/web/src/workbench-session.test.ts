import assert from "node:assert/strict"
import test from "node:test"

import { createFlowState } from "./workbench-state.js"
import { parseSession, serializeSession } from "./workbench-session.js"

const signedCbor = "84a3008001800200a0f5f6"
const signedHash = "3da9a3b38dce0e87ca4a88f3328caac7a970cf9ac40424cde2b675768d11f11b"

test("session parser rejects malformed nested flow state", () => {
  const serialized = serializeSession({ paymentLovelace: "2000000" }, { payment: createFlowState(1) })
  assert.equal(JSON.parse(serialized).version, 2)
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

test("valid v1 sessions migrate to v2 without losing transaction evidence", () => {
  const legacy = {
    version: 1,
    savedAt: "2025-02-03T04:05:06.000Z",
    inputs: { paymentRecipient: "addr_test1", paymentLovelace: "2000000" },
    flows: {
      payment: {
        requiredWitnesses: 1,
        stage: "included",
        inputFingerprint: "inputs-payment",
        artifacts: {
          details: "{\"amount\":\"2000000\"}",
          unsigned: signedCbor,
          witnesses: ["a100"],
          signed: signedCbor,
          txHash: signedHash,
        },
        acknowledgedSignedFingerprint: "signed-fingerprint",
        inclusion: { block: "block-hash", blockHeight: 12345, blockTime: 1_700_000_000 },
        notice: "Transação incluída no bloco 12345.",
      },
      multisig: {
        requiredWitnesses: 2,
        stage: "partially-signed",
        inputFingerprint: "inputs-multisig",
        artifacts: {
          details: "{\"script\":\"2-of-2\"}",
          unsigned: signedCbor,
          witnesses: ["witness-a", ""],
          signed: "",
          txHash: "",
        },
        notice: "1 de 2 assinaturas disponíveis.",
      },
    },
  }

  const migrated = parseSession(JSON.stringify(legacy))
  assert.ok(migrated)
  assert.equal(migrated.version, 2)
  assert.equal(migrated.savedAt, legacy.savedAt)
  assert.deepEqual(migrated.inputs, legacy.inputs)
  assert.deepEqual(migrated.flows.payment.artifacts, legacy.flows.payment.artifacts)
  assert.equal(migrated.flows.payment.stage, "included")
  assert.deepEqual(migrated.flows.payment.inclusion, legacy.flows.payment.inclusion)
  assert.equal(migrated.flows.payment.acknowledgedSignedFingerprint, "signed-fingerprint")
  assert.deepEqual(migrated.flows.payment.notice, {
    key: "flow.notice.included",
    values: { blockHeight: 12345 },
  })
  assert.deepEqual(migrated.flows.multisig.artifacts.witnesses, ["witness-a", ""])
  assert.deepEqual(migrated.flows.multisig.notice, {
    key: "flow.notice.witnessesPartial",
    values: { supplied: 1, required: 2 },
  })
})

import assert from "node:assert/strict"
import test from "node:test"

import { toFlowError } from "./flow-errors.js"

test("expired EAC transaction keeps the stable policy distinction", () => {
  const error = toFlowError("submit", new Error("A janela de validade da transação EAC expirou"))
  assert.equal(error.retryable, false)
  assert.match(error.message, /transação EAC expirou/i)
  assert.match(error.guidance, /policy permanece a mesma/i)
})

test("expired mint errors require rebuilding instead of retrying stale artifacts", () => {
  const error = toFlowError("submit", new Error("A validade da policy do mint expirou"))
  assert.equal(error.retryable, false)
  assert.match(error.message, /validade.*expirou/i)
  assert.match(error.guidance, /Reinicie.*construa um novo mint/i)
})

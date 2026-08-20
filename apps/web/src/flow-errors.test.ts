import assert from "node:assert/strict"
import test from "node:test"

import { formatMessage, messageRef } from "../../../packages/localization/src/index.js"
import { MessageError, toFlowError } from "./flow-errors.js"

test("expired EAC transaction keeps the stable policy distinction", () => {
  const error = toFlowError("submit", new MessageError(
    "eac_transaction_expired",
    messageRef("flow.error.eacExpired.message"),
    messageRef("flow.error.eacExpired.guidance"),
    false,
  ))
  assert.equal(error.retryable, false)
  assert.match(formatMessage(error.message), /transação EAC expirou/i)
  assert.match(formatMessage(error.guidance), /policy permanece a mesma/i)
  assert.match(formatMessage(error.message, "en"), /EAC transaction expired/i)
})

test("expired mint errors require rebuilding instead of retrying stale artifacts", () => {
  const error = toFlowError("submit", new MessageError(
    "mint_transaction_expired",
    messageRef("flow.error.mintExpired.message"),
    messageRef("flow.error.mintExpired.guidance"),
    false,
  ))
  assert.equal(error.retryable, false)
  assert.match(formatMessage(error.message), /validade.*expirou/i)
  assert.match(formatMessage(error.guidance), /Reinicie.*construa um novo mint/i)
  assert.match(formatMessage(error.guidance, "en"), /Restart.*build a new mint/i)
})

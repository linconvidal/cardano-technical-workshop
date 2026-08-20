import assert from "node:assert/strict"
import test from "node:test"

import { eacRetirementIndexedAmountError } from "../../../packages/cardano/src/workshop/04a-mint-eac.js"
import {
  insufficientFundsProblem,
  workshopActionFailedProblem,
} from "./api-error.js"

test("EAC retirement indexing mismatch keeps the previous generic API semantics", () => {
  const technicalDetail = eacRetirementIndexedAmountError(0n).message
  const result = insufficientFundsProblem(technicalDetail) ?? workshopActionFailedProblem(technicalDetail)

  assert.equal(result.status, 422)
  assert.equal(result.problem.code, "workshop_action_failed")
  assert.equal(result.problem.retryable, true)
  assert.equal(result.problem.guidance?.key, "api.workshopActionFailed.guidance")
  assert.equal(result.problem.technicalDetail, technicalDetail)
})

test("actual insufficient-funds diagnostics retain the tADA-specific mapping", () => {
  const result = insufficientFundsProblem("not enough balance to cover the transaction")

  assert.equal(result?.status, 409)
  assert.equal(result?.problem.code, "insufficient_funds")
  assert.equal(result?.problem.retryable, false)
  assert.equal(result?.problem.guidance?.key, "api.insufficientFunds.guidance")
})

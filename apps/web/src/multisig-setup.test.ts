import assert from "node:assert/strict"
import test from "node:test"

import { formatMessage, messageRef } from "../../../packages/localization/src/index.js"
import { HttpError } from "./http.js"
import { multisigAlertContent } from "./multisig-setup.js"

test("multisig setup preserves structured API guidance across locale changes", () => {
  const content = multisigAlertContent(new HttpError(400, {
    code: "invalid_request",
    message: "Os dois signers precisam usar chaves de pagamento diferentes",
    messageRef: messageRef("api.validation.distinctSigners"),
    retryable: false,
    field: "secondSignerAddress",
    guidance: "Conecte ou informe uma segunda wallet com outra chave de pagamento.",
    guidanceRef: messageRef("api.validation.distinctSigners.guidance"),
    technicalDetail: "raw provider detail",
  }))

  assert.match(formatMessage(content.message, "pt-BR"), /chaves de pagamento diferentes/)
  assert.match(formatMessage(content.message, "en"), /different payment keys/)
  assert.match(formatMessage(content.guidance, "pt-BR"), /segunda wallet/)
  assert.match(formatMessage(content.guidance, "en"), /second wallet/)
  assert.equal(content.technicalDetail, "raw provider detail")
})

test("multisig setup keeps unknown failures as raw technical detail", () => {
  const content = multisigAlertContent(new Error("wallet extension rejected the request"))

  assert.match(formatMessage(content.message, "en"), /multisig step could not be completed/)
  assert.equal(content.technicalDetail, "wallet extension rejected the request")
})

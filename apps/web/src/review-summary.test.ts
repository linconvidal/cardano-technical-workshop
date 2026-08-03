import assert from "node:assert/strict"
import test from "node:test"

import { metadataReview, mintReview, paymentReview } from "./review-summary.js"

const recipient = "addr_test1actualrecipient"

test("payment and metadata reviews prefer effects decoded from transaction data", () => {
  const transaction = {
    network: "testnet",
    feeLovelace: "170000",
    outputs: [{ address: recipient, lovelace: "2222222", assets: {} }],
    auxiliaryData: { "674": { msg: "actual message" } },
  }

  assert.match(paymentReview({ recipientAddress: recipient, lovelace: "999", transaction }), /2222222/)
  const review = metadataReview({ recipientAddress: recipient, message: "declared only", transaction })
  assert.match(review, /actual message/)
  assert.doesNotMatch(review, /declared only/)
})

test("mint review reads quantity and recipient allocation from transaction data", () => {
  const policy = "a".repeat(56)
  const asset = "4d79546f6b656e"
  const transaction = {
    network: "testnet",
    feeLovelace: "180000",
    mint: { map: { [policy]: { [asset]: "7" } } },
    outputs: [{
      address: recipient,
      lovelace: "2000000",
      assets: { multiAsset: { map: { [policy]: { [asset]: "7" } } } },
    }],
  }

  const review = mintReview({
    policyId: policy,
    assetNameHex: asset,
    tokenName: "MyToken",
    amount: "999",
    recipientAddress: recipient,
    transaction: { ...transaction, ttlUnixMs: String(Date.now() + 60_000) },
  })
  assert.match(review, /mint de 7 unidade/)
  assert.doesNotMatch(review, /mint de 999 unidade/)
})

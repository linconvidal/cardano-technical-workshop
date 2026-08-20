import assert from "node:assert/strict"
import test from "node:test"

import { formatMessage, type Locale, type MessageRef } from "../../../packages/localization/src/index.js"

import {
  eacMintReview,
  eacRetireReview,
  metadataReview,
  mintReview,
  paymentReview,
} from "./review-summary.js"

const recipient = "addr_test1actualrecipient"
const render = (reference: MessageRef, locale: Locale = "pt-BR") => formatMessage(reference, locale)

test("payment and metadata reviews prefer effects decoded from transaction data", () => {
  const transaction = {
    network: "testnet",
    feeLovelace: "170000",
    outputs: [{ address: recipient, lovelace: "2222222", assets: {} }],
    auxiliaryData: { "674": { msg: "actual message" } },
  }

  assert.match(render(paymentReview({ recipientAddress: recipient, lovelace: "999", transaction }, "pt-BR")), /2222222/)
  const review = render(metadataReview({ recipientAddress: recipient, message: "declared only", transaction }, "pt-BR"))
  assert.match(review, /actual message/)
  assert.doesNotMatch(review, /declared only/)
})

test("EAC review derives quantity, display amount, and raw metadata from transaction data", () => {
  const policy = "b".repeat(56)
  const asset = "4541432d4252452d32303235503031"
  const review = render(eacMintReview({
    policyId: policy,
    assetNameHex: asset,
    tokenName: "EAC-BRE-2025P01",
    recipientAddress: recipient,
    transaction: {
      network: "testnet",
      feeLovelace: "180000",
      ttlUnixMs: String(Date.now() + 60_000),
      mint: { map: { [policy]: { [asset]: "12088322" } } },
      outputs: [{
        address: recipient,
        lovelace: "5000000",
        assets: { multiAsset: { map: { [policy]: { [asset]: "12088322" } } } },
      }],
      auxiliaryData: {
        "65536": {
          version: "1",
          unit: "EAC",
          decimals: "3",
          methodology_hash: "1".repeat(64),
          assurance_hash: "2".repeat(64),
          evidence_root: "3".repeat(64),
        },
      },
    },
  }, "pt-BR"))

  assert.match(review, /12088322 unidades/)
  assert.match(review, /12\.088,322 EAC/)
  assert.match(review, /label 65536/)
  assert.match(review, /policy verifica somente a chave/)
})

test("EAC retirement review derives burn and remaining balance from transaction data", () => {
  const policy = "b".repeat(56)
  const asset = "4541432d4252452d32303235503031"
  const review = render(eacRetireReview({
    policyId: policy,
    assetNameHex: asset,
    tokenName: "EAC-BRE-2025P01",
    recipientAddress: recipient,
    transaction: {
      network: "testnet",
      feeLovelace: "180000",
      ttlUnixMs: String(Date.now() + 60_000),
      mint: { map: { [policy]: { [asset]: "-125000" } } },
      outputs: [{
        address: recipient,
        lovelace: "5000000",
        assets: { multiAsset: { map: { [policy]: { [asset]: "11963322" } } } },
      }],
      auxiliaryData: {
        "65536": {
          version: "1",
          declaration_hash: "4".repeat(64),
          delivery_reference_hash: "5".repeat(64),
        },
      },
    },
  }, "pt-BR"))
  assert.match(review, /burn de -125000/)
  assert.match(review, /125,000 EAC/)
  assert.match(review, /11\.963,322 EAC/)
  assert.match(review, /delivery_reference_hash/)
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

  const review = render(mintReview({
    policyId: policy,
    assetNameHex: asset,
    tokenName: "MyToken",
    amount: "999",
    recipientAddress: recipient,
    transaction: { ...transaction, ttlUnixMs: String(Date.now() + 60_000) },
  }, "pt-BR"))
  assert.match(review, /mint de 7 unidade/)
  assert.doesNotMatch(review, /mint de 999 unidade/)
})

test("reviews render English copy and locale-sensitive EAC quantities", () => {
  const policy = "b".repeat(56)
  const asset = "454143"
  const review = render(eacMintReview({
    policyId: policy,
    assetNameHex: asset,
    tokenName: "EAC",
    recipientAddress: recipient,
    transaction: {
      network: "testnet",
      feeLovelace: "180000",
      ttlUnixMs: String(Date.now() + 60_000),
      mint: { map: { [policy]: { [asset]: "12088322" } } },
      outputs: [{
        address: recipient,
        assets: { multiAsset: { map: { [policy]: { [asset]: "12088322" } } } },
      }],
      auxiliaryData: { "65536": { version: "1", unit: "EAC", decimals: "3" } },
    },
  }, "en"), "en")

  assert.match(review, /issuance of 12088322 units/)
  assert.match(review, /12,088\.322 EAC/)
  assert.match(review, /valid until/i)
})

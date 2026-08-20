import assert from "node:assert/strict"
import test from "node:test"

import { Address, KeyHash } from "@evolution-sdk/evolution"
import { formatMessage } from "../../../packages/localization/src/index.js"
import { MessageError } from "./flow-errors.js"

import {
  ensureEacTransactionValidity,
  ensureMintValidity,
  ensureWalletIsRequiredSigner,
} from "./workbench-flows.js"

test("wallet membership is checked before signing a multisig unlock", () => {
  const signerHash = KeyHash.fromHex("1".repeat(56))
  const signerAddress = Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: signerHash }))
  const unrelatedAddress = Address.toBech32(new Address.Address({
    networkId: 0,
    paymentCredential: KeyHash.fromHex("2".repeat(56)),
  }))

  assert.doesNotThrow(() => ensureWalletIsRequiredSigner({ requiredSigners: [KeyHash.toHex(signerHash)] }, signerAddress))
  assert.throws(
    () => ensureWalletIsRequiredSigner({ requiredSigners: [KeyHash.toHex(signerHash)] }, unrelatedAddress),
    (error) => error instanceof MessageError &&
      formatMessage(error.messageRef, "en").includes("not one of the required signers"),
  )
})

test("EAC validity expires the transaction without describing the stable policy as expired", () => {
  const now = 1_700_000_000_000
  assert.doesNotThrow(() => ensureEacTransactionValidity({ transaction: { ttlUnixMs: String(now + 31_000) } }, now))
  assert.throws(
    () => ensureEacTransactionValidity({ transaction: { ttlUnixMs: String(now + 30_000) } }, now),
    (error) => error instanceof MessageError && error.code === "eac_transaction_expired" &&
      /transação EAC expirou/i.test(formatMessage(error.messageRef, "pt-BR")),
  )
})

test("mint validity requires enough time to sign and submit", () => {
  const now = 1_700_000_000_000
  assert.doesNotThrow(() => ensureMintValidity({ transaction: { ttlUnixMs: String(now + 31_000) } }, now))
  assert.throws(
    () => ensureMintValidity({ transaction: { ttlUnixMs: String(now + 30_000) } }, now),
    (error) => error instanceof MessageError && error.code === "mint_transaction_expired" &&
      /mint policy validity expired/i.test(formatMessage(error.messageRef, "en")),
  )
  assert.throws(
    () => ensureMintValidity(undefined, now),
    (error) => error instanceof MessageError && error.code === "mint_transaction_expired",
  )
})

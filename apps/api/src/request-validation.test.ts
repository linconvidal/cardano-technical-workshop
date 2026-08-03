import assert from "node:assert/strict"
import test from "node:test"

import {
  Address,
  Assets,
  KeyHash,
  ScriptHash,
  Transaction,
  TransactionBody,
  TransactionHash,
  TransactionInput,
  TransactionWitnessSet,
  TxOut,
} from "@evolution-sdk/evolution"

import { RequestValidationError } from "./api-error.js"
import {
  parseMultisigInputVerificationRequest,
  parseMultisigRequest,
  parsePaymentRequest,
  parseSubmitTxRequest,
  parseTransactionHash,
} from "./request-validation.js"

const keyAddress = (keyByte: string, networkId = 0, stakeByte?: string) => Address.toBech32(new Address.Address({
  networkId,
  paymentCredential: KeyHash.fromHex(keyByte.repeat(56)),
  stakingCredential: stakeByte ? KeyHash.fromHex(stakeByte.repeat(56)) : undefined,
}))

test("missing request bodies produce a structured validation error", () => {
  assert.throws(() => parsePaymentRequest(), RequestValidationError)
  assert.throws(() => parseSubmitTxRequest(), RequestValidationError)
})

test("parses a positive payment request on testnet", () => {
  const userAddress = keyAddress("1")
  const recipientAddress = keyAddress("2")

  assert.deepEqual(parsePaymentRequest({
    userAddress,
    recipientAddress,
    lovelace: "2000000",
  }), {
    userAddress,
    recipientAddress,
    lovelace: 2_000_000n,
  })
})

test("rejects mainnet addresses, zero values, and unsafe numeric values", () => {
  const testnetAddress = keyAddress("1")

  assert.throws(
    () => parsePaymentRequest({
      userAddress: keyAddress("1", 1),
      recipientAddress: testnetAddress,
      lovelace: "2000000",
    }),
    RequestValidationError,
  )
  assert.throws(
    () => parsePaymentRequest({
      userAddress: testnetAddress,
      recipientAddress: keyAddress("2"),
      lovelace: "0",
    }),
    /maior que zero/,
  )
  assert.throws(
    () => parsePaymentRequest({
      userAddress: testnetAddress,
      recipientAddress: keyAddress("2"),
      lovelace: Number.MAX_SAFE_INTEGER + 1,
    }),
    /número inteiro positivo/,
  )
})

test("validates a script UTxO verification request", () => {
  const scriptAddress = Address.toBech32(new Address.Address({
    networkId: 0,
    paymentCredential: ScriptHash.fromHex("7".repeat(56)),
  }))
  const scriptUtxo = `${"a".repeat(64)}#0`
  assert.deepEqual(parseMultisigInputVerificationRequest({ scriptAddress, scriptUtxo }), { scriptAddress, scriptUtxo })
  assert.throws(
    () => parseMultisigInputVerificationRequest({ scriptAddress: keyAddress("8"), scriptUtxo }),
    /credencial de script/,
  )
})

test("rejects two multisig addresses backed by the same payment key", () => {
  const signerA = keyAddress("3", 0, "4")
  const signerBWithSamePaymentKey = keyAddress("3", 0, "5")

  assert.throws(
    () => parseMultisigRequest({
      userAddress: signerA,
      secondSignerAddress: signerBWithSamePaymentKey,
    }),
    /chaves de pagamento diferentes/,
  )
})

test("normalizes transaction hashes and validates signed transaction CBOR", () => {
  const address = Address.fromBech32(keyAddress("6"))
  const transaction = new Transaction.Transaction({
    body: new TransactionBody.TransactionBody({
      inputs: [new TransactionInput.TransactionInput({
        transactionId: TransactionHash.fromHex("a".repeat(64)),
        index: 0n,
      })],
      outputs: [new TxOut.TransactionOutput({ address, assets: Assets.fromLovelace(2_000_000n) })],
      fee: 170_000n,
    }),
    witnessSet: TransactionWitnessSet.empty(),
    isValid: true,
    auxiliaryData: null,
  })
  const cbor = Transaction.toCBORHex(transaction)

  assert.equal(parseTransactionHash("A".repeat(64)), "a".repeat(64))
  assert.equal(parseSubmitTxRequest({ signedTxCbor: `0x${cbor}` }), cbor)
  assert.throws(() => parseTransactionHash("xyz"), /64 caracteres/)
  assert.throws(() => parseSubmitTxRequest({ signedTxCbor: "123" }), /CBOR hexadecimal/)
  assert.throws(() => parseSubmitTxRequest({ signedTxCbor: "00" }), /transação Cardano válida/)
})

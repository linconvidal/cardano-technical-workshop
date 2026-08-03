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
  parseEacMintRequest,
  parseEacRetireRequest,
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

test("parses the exact EAC issuance metadata schema", () => {
  const userAddress = keyAddress("1")
  const recipientAddress = userAddress
  const metadata = {
    version: 1,
    unit: "EAC",
    decimals: 3,
    methodology_hash: "1".repeat(64),
    assurance_hash: "2".repeat(64),
    evidence_root: "3".repeat(64),
  }

  assert.deepEqual(parseEacMintRequest({
    userAddress,
    recipientAddress,
    metadataJson: JSON.stringify(metadata),
  }), { userAddress, recipientAddress, metadata })
})

test("rejects malformed or expanded EAC issuance metadata", () => {
  const base = {
    version: 1,
    unit: "EAC",
    decimals: 3,
    methodology_hash: "1".repeat(64),
    assurance_hash: "2".repeat(64),
    evidence_root: "3".repeat(64),
  }
  const request = (metadataJson: string) => parseEacMintRequest({
    userAddress: keyAddress("1"),
    recipientAddress: keyAddress("1"),
    metadataJson,
  })

  assert.throws(() => request("{"), /JSON válido/)
  for (const value of [null, [], "metadata"]) {
    assert.throws(() => request(JSON.stringify(value)), /objeto JSON/)
  }
  assert.throws(() => request(JSON.stringify({ ...base, quantity: "12088322" })), /exatamente/)
  const { evidence_root: _omitted, ...missingKey } = base
  assert.throws(() => request(JSON.stringify(missingKey)), /exatamente/)
  assert.throws(() => request(JSON.stringify({ ...base, version: "1" })), /version 1/)
  assert.throws(() => request(JSON.stringify({ ...base, unit: "eac" })), /unit EAC/)
  assert.throws(() => request(JSON.stringify({ ...base, decimals: "3" })), /decimals 3/)
  assert.throws(() => request(JSON.stringify({ ...base, methodology_hash: "a".repeat(63) })), /64 caracteres/)
  assert.throws(() => request(JSON.stringify({ ...base, assurance_hash: "G".repeat(64) })), /hexadecimais minúsculos/)
  assert.throws(() => request(JSON.stringify({ ...base, evidence_root: "A".repeat(64) })), /hexadecimais minúsculos/)
})

test("EAC issuance keeps the illustrative balance in the connected wallet", () => {
  const metadataJson = JSON.stringify({
    version: 1,
    unit: "EAC",
    decimals: 3,
    methodology_hash: "1".repeat(64),
    assurance_hash: "2".repeat(64),
    evidence_root: "3".repeat(64),
  })
  assert.throws(() => parseEacMintRequest({
    userAddress: keyAddress("1"),
    recipientAddress: keyAddress("2"),
    metadataJson,
  }), /wallet conectada/)
})

test("parses the exact EAC retirement metadata schema", () => {
  const userAddress = keyAddress("1")
  const metadata = {
    version: 1 as const,
    declaration_hash: "4".repeat(64),
    delivery_reference_hash: "5".repeat(64),
  }
  assert.deepEqual(parseEacRetireRequest({
    userAddress,
    metadataJson: JSON.stringify(metadata),
  }), { userAddress, metadata })
  assert.throws(() => parseEacRetireRequest({
    userAddress,
    metadataJson: JSON.stringify({ ...metadata, quantity: "125000" }),
  }), /exatamente/)
})

test("EAC issuance rejects mainnet addresses", () => {
  assert.throws(() => parseEacMintRequest({
    userAddress: keyAddress("1", 1),
    recipientAddress: keyAddress("2"),
    metadataJson: JSON.stringify({
      version: 1,
      unit: "EAC",
      decimals: 3,
      methodology_hash: "1".repeat(64),
      assurance_hash: "2".repeat(64),
      evidence_root: "3".repeat(64),
    }),
  }), /testnet/)
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

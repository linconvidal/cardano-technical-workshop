import assert from "node:assert/strict"
import test from "node:test"

import {
  Address,
  Assets,
  KeyHash,
  PrivateKey,
  Transaction,
  TransactionBody,
  TransactionHash,
  TransactionInput,
  TransactionWitnessSet,
  TxOut,
} from "@evolution-sdk/evolution"

import { mergeWitnesses } from "./workbench-ui.js"

const makeUnsigned = (fee = 170_000n, requiredSigners: Array<KeyHash.KeyHash> = []) => {
  const paymentKey = KeyHash.fromHex("1".repeat(56))
  const address = new Address.Address({ networkId: 0, paymentCredential: paymentKey })
  const body = new TransactionBody.TransactionBody({
    inputs: [new TransactionInput.TransactionInput({
      transactionId: TransactionHash.fromHex("a".repeat(64)),
      index: 0n,
    })],
    outputs: [new TxOut.TransactionOutput({
      address,
      assets: Assets.fromLovelace(2_000_000n),
    })],
    fee,
    networkId: 0,
    requiredSigners: requiredSigners.length > 0
      ? requiredSigners as [KeyHash.KeyHash, ...Array<KeyHash.KeyHash>]
      : undefined,
  })
  const transaction = new Transaction.Transaction({
    body,
    witnessSet: TransactionWitnessSet.empty(),
    isValid: true,
    auxiliaryData: null,
  })
  return { body, cbor: Transaction.toCBORHex(transaction) }
}

const signBody = (body: TransactionBody.TransactionBody, privateKey: PrivateKey.PrivateKey) => {
  const vkey = PrivateKey.toPublicKey(privateKey)
  const witness = new TransactionWitnessSet.VKeyWitness({
    vkey,
    signature: PrivateKey.sign(privateKey, TransactionBody.toHash(body).hash),
  })
  return {
    hash: KeyHash.toHex(KeyHash.fromVKey(vkey)),
    cbor: TransactionWitnessSet.toCBORHex(TransactionWitnessSet.fromVKeyWitnesses([witness])),
  }
}

test("merge validates signatures and required multisig key hashes", () => {
  const signerAKey = PrivateKey.fromBytes(PrivateKey.generate())
  const signerBKey = PrivateKey.fromBytes(PrivateKey.generate())
  const requiredSigners = [signerAKey, signerBKey].map((key) => KeyHash.fromVKey(PrivateKey.toPublicKey(key)))
  const unsigned = makeUnsigned(170_000n, requiredSigners)
  const signerA = signBody(unsigned.body, signerAKey)
  const signerB = signBody(unsigned.body, signerBKey)

  const signedCbor = mergeWitnesses(unsigned.cbor, [signerA.cbor, signerB.cbor], [signerA.hash, signerB.hash])
  const signed = Transaction.fromCBORHex(signedCbor)
  assert.equal(signed.witnessSet.vkeyWitnesses?.length, 2)
})

test("merge enforces the reviewed signer when the body has no requiredSigners field", () => {
  const unsigned = makeUnsigned()
  const expected = signBody(unsigned.body, PrivateKey.fromBytes(PrivateKey.generate()))
  const unrelated = signBody(unsigned.body, PrivateKey.fromBytes(PrivateKey.generate()))

  assert.doesNotThrow(() => mergeWitnesses(unsigned.cbor, [expected.cbor], [expected.hash]))
  assert.throws(() => mergeWitnesses(unsigned.cbor, [unrelated.cbor], [expected.hash]), /Faltam assinaturas/)
})

test("merge derives required signer membership from the transaction body", () => {
  const signerAKey = PrivateKey.fromBytes(PrivateKey.generate())
  const signerBKey = PrivateKey.fromBytes(PrivateKey.generate())
  const requiredSigners = [signerAKey, signerBKey].map((key) => KeyHash.fromVKey(PrivateKey.toPublicKey(key)))
  const unsigned = makeUnsigned(170_000n, requiredSigners)
  const signerA = signBody(unsigned.body, signerAKey)
  const signerB = signBody(unsigned.body, signerBKey)
  const unrelated = signBody(unsigned.body, PrivateKey.fromBytes(PrivateKey.generate()))

  assert.doesNotThrow(() => mergeWitnesses(unsigned.cbor, [signerA.cbor, signerB.cbor]))
  assert.throws(() => mergeWitnesses(unsigned.cbor, [signerA.cbor, unrelated.cbor]), /Faltam assinaturas/)
})

test("merge rejects duplicate, missing, and wrong-body signatures", () => {
  const signerAKey = PrivateKey.fromBytes(PrivateKey.generate())
  const signerBKey = PrivateKey.fromBytes(PrivateKey.generate())
  const requiredSigners = [signerAKey, signerBKey].map((key) => KeyHash.fromVKey(PrivateKey.toPublicKey(key)))
  const unsigned = makeUnsigned(170_000n, requiredSigners)
  const signerA = signBody(unsigned.body, signerAKey)
  const signerB = signBody(unsigned.body, signerBKey)

  assert.throws(
    () => mergeWitnesses(unsigned.cbor, [signerA.cbor, signerA.cbor], [signerA.hash, signerB.hash]),
    /Assinatura duplicada/,
  )
  assert.throws(
    () => mergeWitnesses(unsigned.cbor, [signerA.cbor], [signerA.hash, signerB.hash]),
    /Faltam assinaturas/,
  )

  const other = makeUnsigned(170_001n, requiredSigners)
  const wrongBodyWitness = signBody(other.body, signerAKey)
  assert.throws(
    () => mergeWitnesses(unsigned.cbor, [wrongBodyWitness.cbor]),
    /Assinatura inválida/,
  )
})

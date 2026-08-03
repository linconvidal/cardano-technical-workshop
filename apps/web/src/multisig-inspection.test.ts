import assert from "node:assert/strict"
import test from "node:test"

import {
  Address,
  Assets,
  KeyHash,
  NativeScripts,
  PrivateKey,
  ScriptHash,
  Transaction,
  TransactionBody,
  TransactionHash,
  TransactionInput,
  TransactionWitnessSet,
  TxOut,
} from "@evolution-sdk/evolution"

import { inspectMultisigUnlock } from "./multisig-inspection.js"

const makeUnlock = (includeScript = true, donation?: bigint) => {
  const keys = [
    PrivateKey.fromBytes(PrivateKey.generate()),
    PrivateKey.fromBytes(PrivateKey.generate()),
  ]
  const keyHashes = keys.map((key) => KeyHash.fromVKey(PrivateKey.toPublicKey(key)))
  const nativeScript = NativeScripts.makeScriptAll(keyHashes.map((keyHash) =>
    NativeScripts.makeScriptPubKey(KeyHash.toBytes(keyHash)).script))
  const scriptAddress = new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromScript(nativeScript) })
  const destination = new Address.Address({ networkId: 0, paymentCredential: KeyHash.fromHex("d".repeat(56)) })
  const body = new TransactionBody.TransactionBody({
    inputs: [new TransactionInput.TransactionInput({
      transactionId: TransactionHash.fromHex("a".repeat(64)),
      index: 1n,
    })],
    outputs: [
      new TxOut.TransactionOutput({ address: destination, assets: Assets.fromLovelace(2_000_000n) }),
      new TxOut.TransactionOutput({ address: scriptAddress, assets: Assets.fromLovelace(7_800_000n) }),
    ],
    fee: 200_000n,
    networkId: 0,
    requiredSigners: keyHashes as [KeyHash.KeyHash, KeyHash.KeyHash],
    donation,
  })
  const transaction = new Transaction.Transaction({
    body,
    witnessSet: includeScript
      ? TransactionWitnessSet.fromNativeScripts([nativeScript])
      : TransactionWitnessSet.empty(),
    isValid: true,
    auxiliaryData: null,
  })

  return {
    cbor: Transaction.toCBORHex(transaction),
    destination: Address.toBech32(destination),
    scriptAddress: Address.toBech32(scriptAddress),
  }
}

test("inspects imported unlock from the CBOR itself", () => {
  const unlock = makeUnlock()
  const details = inspectMultisigUnlock(unlock.cbor)

  assert.equal(details.destinationAddress, unlock.destination)
  assert.equal(details.scriptAddress, unlock.scriptAddress)
  assert.equal(details.selectedScriptUtxo, `${"a".repeat(64)}#1`)
  assert.equal(details.lovelace, "2000000")
  assert.equal(details.changeLovelace, "7800000")
  assert.equal((details.requiredSigners as Array<string>).length, 2)
})

test("rejects undisclosed effects in an imported unlock", () => {
  assert.throws(
    () => inspectMultisigUnlock(makeUnlock(true, 1_000_000n).cbor),
    /efeitos.*fora do unlock/i,
  )
})

test("rejects an imported transaction without the reviewed 2-de-2 script", () => {
  assert.throws(
    () => inspectMultisigUnlock(makeUnlock(false).cbor),
    /script nativo 2-de-2/,
  )
})

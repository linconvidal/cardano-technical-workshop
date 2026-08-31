import {
  KeyHash,
  Transaction,
  TransactionBody,
  VKey,
} from "@evolution-sdk/evolution"

export const validateTransactionVKeyWitnesses = (
  transaction: Transaction.Transaction,
  expectedSignerHashes?: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (!transaction.isValid) throw new Error("transaction_marked_invalid")

  const witnesses = transaction.witnessSet.vkeyWitnesses ?? []
  if (witnesses.length === 0) throw new Error("witness_set_missing_vkey_signature")

  const bodyHash = TransactionBody.toHash(transaction.body).hash
  const signerHashes = new Set<string>()
  for (const witness of witnesses) {
    const signerHash = KeyHash.toHex(KeyHash.fromVKey(witness.vkey)).toLowerCase()
    if (signerHashes.has(signerHash)) throw new Error(`duplicate_signer_witness: ${signerHash}`)
    if (!VKey.verify(witness.vkey, bodyHash, witness.signature.bytes)) {
      throw new Error(`invalid_signer_signature: ${signerHash}`)
    }
    signerHashes.add(signerHash)
  }

  const bodyRequiredSigners = (transaction.body.requiredSigners ?? []).map((keyHash) =>
    KeyHash.toHex(keyHash).toLowerCase())
  const expectedSigners = expectedSignerHashes?.map((hash) => hash.toLowerCase())
  if (expectedSigners && bodyRequiredSigners.length > 0 && !sameSet(bodyRequiredSigners, expectedSigners)) {
    throw new Error("required_signers_mismatch")
  }

  const requiredSigners = expectedSigners ?? bodyRequiredSigners
  if (requiredSigners.length === 0) return [...signerHashes]

  const expected = new Set(requiredSigners)
  const missing = [...expected].filter((hash) => !signerHashes.has(hash))
  const unexpected = [...signerHashes].filter((hash) => !expected.has(hash))
  if (missing.length > 0) throw new Error(`missing_signer_witnesses: ${missing.join(", ")}`)
  if (unexpected.length > 0) throw new Error(`unexpected_signer_witness: ${unexpected.join(", ")}`)
  return [...signerHashes]
}

const sameSet = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value) => right.includes(value))

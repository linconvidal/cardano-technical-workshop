import {
  Address,
  Assets,
  KeyHash,
  NativeScripts,
  ScriptHash,
  Transaction,
  TransactionHash,
} from "@evolution-sdk/evolution"

import { summarizeTransaction } from "../../../packages/cardano/src/workshop/transaction-summary.js"

export const inspectMultisigUnlock = (unsignedCbor: string): Record<string, unknown> => {
  const transaction = Transaction.fromCBORHex(unsignedCbor.trim())
  if (!transaction.isValid) throw new Error("O CBOR importado está marcado como inválido")
  assertNoUndisclosedEffects(transaction)

  const requiredSigners = (transaction.body.requiredSigners ?? []).map(KeyHash.toHex)
  if (requiredSigners.length !== 2 || new Set(requiredSigners).size !== 2) {
    throw new Error("O CBOR importado não exige exatamente dois signers distintos")
  }

  const nativeScripts = transaction.witnessSet.nativeScripts ?? []
  if (nativeScripts.length !== 1) {
    throw new Error("O CBOR importado precisa conter somente o script nativo 2-de-2 revisado")
  }
  const matchingScript = nativeScripts.find((nativeScript) => {
    if (nativeScript.script._tag !== "ScriptAll" || nativeScript.script.scripts.length !== 2) return false
    if (!nativeScript.script.scripts.every((script) => script._tag === "ScriptPubKey")) return false
    const scriptSigners = NativeScripts.extractKeyHashes(nativeScript.script).map((bytes) =>
      KeyHash.toHex(KeyHash.fromBytes(bytes)))
    return sameSet(scriptSigners, requiredSigners)
  })
  if (!matchingScript) {
    throw new Error("O CBOR importado não contém um script 2-de-2 compatível com os required signers")
  }

  if (transaction.body.inputs.length !== 1) {
    throw new Error("O unlock importado precisa consumir exatamente um UTxO do script")
  }

  const scriptAddress = Address.toBech32(new Address.Address({
    networkId: 0,
    paymentCredential: ScriptHash.fromScript(matchingScript),
  }))
  const outputs = transaction.body.outputs.map((output) => ({
    address: Address.toBech32(output.address),
    lovelace: Assets.lovelaceOf(output.assets).toString(),
    assets: output.assets.toJSON(),
  }))
  if (outputs.some((output) => !output.address.startsWith("addr_test"))) {
    throw new Error("O CBOR importado contém output fora de testnet")
  }
  if (outputs.some((output) => output.assets.multiAsset !== undefined)) {
    throw new Error("O unlock importado precisa movimentar somente tADA")
  }

  const scriptChange = outputs.filter((output) => output.address === scriptAddress)
  const destinations = outputs.filter((output) => output.address !== scriptAddress)
  if (scriptChange.length !== 1 || destinations.length !== 1) {
    throw new Error("O unlock importado precisa ter um destino e um output de troco para o script")
  }

  const selectedInput = transaction.body.inputs[0]
  const selectedScriptUtxo = `${TransactionHash.toHex(selectedInput.transactionId)}#${selectedInput.index}`

  return {
    kind: "multisig-unlock-imported",
    imported: true,
    destinationAddress: destinations[0].address,
    lovelace: destinations[0].lovelace,
    selectedScriptUtxo,
    scriptAddress,
    changeLovelace: scriptChange[0].lovelace,
    requiredSigners,
    nativeScriptCbor: NativeScripts.toCBORHex(matchingScript),
    transaction: summarizeTransaction(transaction),
  }
}

const assertNoUndisclosedEffects = (transaction: Transaction.Transaction) => {
  const body = transaction.body
  const forbidden = [
    body.certificates,
    body.withdrawals,
    body.auxiliaryDataHash,
    body.mint,
    body.scriptDataHash,
    body.collateralInputs,
    body.collateralReturn,
    body.totalCollateral,
    body.referenceInputs,
    body.votingProcedures,
    body.proposalProcedures,
    body.currentTreasuryValue,
    body.donation,
    transaction.auxiliaryData,
    transaction.witnessSet.vkeyWitnesses,
    transaction.witnessSet.bootstrapWitnesses,
    transaction.witnessSet.plutusV1Scripts,
    transaction.witnessSet.plutusData,
    transaction.witnessSet.redeemers,
    transaction.witnessSet.plutusV2Scripts,
    transaction.witnessSet.plutusV3Scripts,
  ]
  if (forbidden.some((value) => value !== undefined && value !== null)) {
    throw new Error("O CBOR importado contém efeitos ou witnesses fora do unlock nativo permitido")
  }
}

const sameSet = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value) => right.includes(value))

import { Address, Assets, Client, KeyHash, NativeScripts, ScriptHash, Transaction, UTxO, preprod } from "@evolution-sdk/evolution"

import { expectKeyHash } from "../internal/addresses.js"
import { BLOCKFROST_PREPROD_URL, loadBlockfrostProjectId } from "../internal/blockfrost-client.js"
import { bytesToHex } from "../internal/serialization.js"
import type { MultisigDetails, MultisigLockParams, MultisigParams, MultisigUnlockParams, TxBuildResult } from "./types.js"

export const describeMultisig = (params: MultisigParams): MultisigDetails => {
  const nativeScript = twoSignerScript(params.userAddress, params.secondSignerAddress)
  const scriptAddress = scriptAddressFromNativeScript(nativeScript)

  return {
    firstSignerAddress: params.userAddress,
    secondSignerAddress: params.secondSignerAddress,
    scriptAddress: Address.toBech32(scriptAddress),
    scriptHash: ScriptHash.toHex(ScriptHash.fromScript(nativeScript)),
    nativeScriptCbor: NativeScripts.toCBORHex(nativeScript),
    nativeScriptJson: JSON.stringify(NativeScripts.toJSON(nativeScript.script), null, 2),
    requiredSigners: NativeScripts.extractKeyHashes(nativeScript.script).map(bytesToHex),
  }
}

export const listMultisigScriptUtxos = async (params: MultisigParams) => {
  const provider = Client.make(preprod).withBlockfrost({
    baseUrl: BLOCKFROST_PREPROD_URL,
    projectId: loadBlockfrostProjectId(),
  })
  const details = describeMultisig(params)
  const scriptAddress = Address.fromBech32(details.scriptAddress)
  const scriptUtxos = await provider.getUtxos(scriptAddress)

  return {
    scriptAddress: details.scriptAddress,
    scriptUtxos: scriptUtxos.map(summarizeScriptUtxo),
  }
}

export const buildMultisigLockTx = async (params: MultisigLockParams): Promise<TxBuildResult> => {
  const details = describeMultisig(params)
  const result = await Client.make(preprod)
    .withBlockfrost({
      baseUrl: BLOCKFROST_PREPROD_URL,
      projectId: loadBlockfrostProjectId(),
    })
    .withAddress(params.userAddress)
    .newTx()
    .payToAddress({
      address: Address.fromBech32(details.scriptAddress),
      assets: Assets.fromLovelace(params.lovelace),
    })
    .build()

  const transaction = await result.toTransaction()

  return {
    txCbor: Transaction.toCBORHex(transaction),
    details: {
      kind: "multisig-lock",
      lovelace: params.lovelace.toString(),
      ...details,
    },
  }
}

export const buildMultisigUnlockTx = async (params: MultisigUnlockParams): Promise<TxBuildResult> => {
  const provider = Client.make(preprod).withBlockfrost({
    baseUrl: BLOCKFROST_PREPROD_URL,
    projectId: loadBlockfrostProjectId(),
  })
  const nativeScript = twoSignerScript(params.userAddress, params.secondSignerAddress)
  const details = describeMultisig(params)
  const scriptAddress = Address.fromBech32(details.scriptAddress)
  const scriptUtxos = await provider.getUtxos(scriptAddress)
  const selectedScriptUtxo = selectScriptUtxo(scriptUtxos, params.scriptUtxo, details.scriptAddress)

  const builder = provider
    .newTx()
    .attachScript({ script: nativeScript })
    .collectFrom({ inputs: [selectedScriptUtxo] })
    .payToAddress({
      address: Address.fromBech32(params.destinationAddress),
      assets: Assets.fromLovelace(params.lovelace),
    })

  for (const keyHashBytes of NativeScripts.extractKeyHashes(nativeScript.script)) {
    builder.addSigner({ keyHash: KeyHash.fromBytes(keyHashBytes) })
  }

  const result = await builder.build({
    availableUtxos: [selectedScriptUtxo],
    changeAddress: Address.fromBech32(details.scriptAddress),
  })
  const transaction = await result.toTransaction()

  return {
    txCbor: Transaction.toCBORHex(transaction),
    details: {
      kind: "multisig-unlock",
      destinationAddress: params.destinationAddress,
      lovelace: params.lovelace.toString(),
      selectedScriptUtxo: UTxO.toOutRefString(selectedScriptUtxo),
      ...details,
    },
  }
}

export const twoSignerScript = (
  firstSignerAddress: string,
  secondSignerAddress: string,
): NativeScripts.NativeScript => {
  const firstKeyHash = paymentKeyHashFromAddress(firstSignerAddress, "first signer")
  const secondKeyHash = paymentKeyHashFromAddress(secondSignerAddress, "second signer")
  const firstScript = NativeScripts.makeScriptPubKey(KeyHash.toBytes(firstKeyHash))
  const secondScript = NativeScripts.makeScriptPubKey(KeyHash.toBytes(secondKeyHash))

  return NativeScripts.makeScriptAll([firstScript.script, secondScript.script])
}

export const scriptAddressFromNativeScript = (nativeScript: NativeScripts.NativeScript): Address.Address =>
  new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromScript(nativeScript) })

const paymentKeyHashFromAddress = (bech32: string, label: string): KeyHash.KeyHash =>
  expectKeyHash(Address.fromBech32(bech32).paymentCredential, `${label} payment credential`)

const selectScriptUtxo = (
  scriptUtxos: ReadonlyArray<UTxO.UTxO>,
  selectedOutRef: string | undefined,
  scriptAddress: string,
): UTxO.UTxO => {
  if (scriptUtxos.length === 0) throw new Error(`No UTxO found at script address ${scriptAddress}`)

  if (selectedOutRef) {
    const selected = scriptUtxos.find((utxo) => UTxO.toOutRefString(utxo) === selectedOutRef)
    if (selected) return selected

    throw new Error(
      `Script UTxO ${selectedOutRef} not found. Available outRefs: ${scriptUtxos.map(UTxO.toOutRefString).join(", ")}`,
    )
  }

  if (scriptUtxos.length === 1) return scriptUtxos[0]

  throw new Error(
    `Multiple script UTxOs found. Choose one before building unlock: ${scriptUtxos.map(UTxO.toOutRefString).join(", ")}`,
  )
}

const summarizeScriptUtxo = (utxo: UTxO.UTxO) => ({
  outRef: UTxO.toOutRefString(utxo),
  lovelace: Assets.lovelaceOf(utxo.assets).toString(),
  assets: utxo.assets.toJSON(),
})

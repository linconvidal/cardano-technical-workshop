import {
  Address,
  Assets,
  Client,
  KeyHash,
  NativeScripts,
  ScriptHash,
  Time,
  Transaction,
  TransactionHash,
  TransactionMetadatum,
  TransactionWitnessSet,
  UTxO,
  preprod,
} from "@evolution-sdk/evolution"

import { credentialToHex, expectKeyHash } from "../internal/addresses.js"
import {
  BLOCKFROST_PREPROD_URL,
  deriveAddressFromSeed,
  loadBlockfrostProjectId,
  loadMnemonic,
} from "../internal/blockfrost-client.js"
import { bytesToHex, textToAssetNameBytes } from "../internal/serialization.js"
import { cip25TokenMetadata } from "../workshop/03-mint-cip25.js"
import {
  describeMultisig as describeMultisigForAddresses,
  scriptAddressFromNativeScript,
  twoSignerScript,
} from "../workshop/04-multisig.js"

const MINT_POLICY_TTL_MS = 3 * 60 * 60 * 1000
const MINT_OUTPUT_MIN_LOVELACE = 5_000_000n

export const describeWallet = () => {
  const address = deriveAddressFromSeed()

  return {
    address,
    addressBech32: Address.toBech32(address),
    addressHex: Address.toHex(address),
    paymentKeyHash: credentialToHex(address.paymentCredential),
    stakingKeyHash: address.stakingCredential ? credentialToHex(address.stakingCredential) : undefined,
  }
}

export const sendAda = async (destinationBech32: string, lovelace: bigint) => {
  const client = Client.make(preprod)
    .withBlockfrost({
      baseUrl: BLOCKFROST_PREPROD_URL,
      projectId: loadBlockfrostProjectId(),
    })
    .withSeed({
      mnemonic: loadMnemonic(),
      accountIndex: 0,
    })

  const tx = await client
    .newTx()
    .payToAddress({ address: Address.fromBech32(destinationBech32), assets: Assets.fromLovelace(lovelace) })
    .build()

  const signed = await tx.sign()
  const txHash = await signed.submit()
  return TransactionHash.toHex(txHash)
}

export const buildPaymentCborFromSeedAddress = async (destinationBech32: string, lovelace: bigint) => {
  const userAddressBech32 = Address.toBech32(deriveAddressFromSeed())
  const result = await Client.make(preprod)
    .withBlockfrost({
      baseUrl: BLOCKFROST_PREPROD_URL,
      projectId: loadBlockfrostProjectId(),
    })
    .withAddress(userAddressBech32)
    .newTx()
    .payToAddress({ address: Address.fromBech32(destinationBech32), assets: Assets.fromLovelace(lovelace) })
    .build()

  const transaction = await result.toTransaction()
  return Transaction.toCBORHex(transaction)
}

export const buildPaymentCborWithMetadataFromSeedAddress = async (
  destinationBech32: string,
  lovelace: bigint,
  message: string,
) => {
  const metadata = TransactionMetadatum.fromEntries([["msg", message]])
  const result = await Client.make(preprod)
    .withBlockfrost({
      baseUrl: BLOCKFROST_PREPROD_URL,
      projectId: loadBlockfrostProjectId(),
    })
    .withAddress(Address.toBech32(deriveAddressFromSeed()))
    .newTx()
    .payToAddress({ address: Address.fromBech32(destinationBech32), assets: Assets.fromLovelace(lovelace) })
    .attachMetadata({ label: 674n, metadata })
    .build()
  const transaction = await result.toTransaction()
  return Transaction.toCBORHex(transaction)
}

export const buildTwoSignerMultisigScript = (
  localAddress: Address.Address,
  secondSignerBech32: string,
): NativeScripts.NativeScript => twoSignerScript(Address.toBech32(localAddress), secondSignerBech32)

export const describeMultisig = (secondSignerAddress: string) => {
  const localAddress = Address.toBech32(deriveAddressFromSeed())
  const nativeScript = buildTwoSignerMultisigScript(deriveAddressFromSeed(), secondSignerAddress)
  const details = describeMultisigForAddresses({
    userAddress: localAddress,
    secondSignerAddress,
  })

  return {
    localAddress,
    nativeScript,
    nativeScriptCbor: details.nativeScriptCbor,
    policyId: details.scriptHash,
    scriptAddress: details.scriptAddress,
    requiredSigners: details.requiredSigners,
  }
}

export const lockAdaAtMultisig = async (secondSignerAddress: string, lovelace: bigint) => {
  const { scriptAddress } = describeMultisig(secondSignerAddress)
  return sendAda(scriptAddress, lovelace)
}

export const buildMultisigPartialCbor = async (
  secondSignerAddress: string,
  destinationBech32: string,
  lovelace: bigint,
  scriptUtxoOutRef: string,
) => {
  const client = Client.make(preprod)
    .withBlockfrost({
      baseUrl: BLOCKFROST_PREPROD_URL,
      projectId: loadBlockfrostProjectId(),
    })
    .withSeed({
      mnemonic: loadMnemonic(),
      accountIndex: 0,
    })
  const nativeScript = buildTwoSignerMultisigScript(deriveAddressFromSeed(), secondSignerAddress)
  const scriptAddress = scriptAddressFromNativeScript(nativeScript)
  const scriptUtxos = await client.getUtxos(scriptAddress)

  if (scriptUtxos.length === 0) {
    throw new Error(`No UTxO found at script address ${Address.toBech32(scriptAddress)}`)
  }

  const selectedScriptUtxo = scriptUtxos.find((utxo) => UTxO.toOutRefString(utxo) === scriptUtxoOutRef)
  if (!selectedScriptUtxo) {
    throw new Error(`Script UTxO ${scriptUtxoOutRef} not found. Available outRefs: ${scriptUtxos.map(UTxO.toOutRefString).join(", ")}`)
  }

  const builder = client
    .newTx()
    .attachScript({ script: nativeScript })
    .collectFrom({ inputs: [selectedScriptUtxo] })
    .payToAddress({ address: Address.fromBech32(destinationBech32), assets: Assets.fromLovelace(lovelace) })

  for (const keyHashBytes of NativeScripts.extractKeyHashes(nativeScript.script)) {
    builder.addSigner({ keyHash: KeyHash.fromBytes(keyHashBytes) })
  }

  const signBuilder = await builder.build({ availableUtxos: [selectedScriptUtxo], changeAddress: scriptAddress })
  const unsignedTransaction = await signBuilder.toTransaction()
  const localWitness = await signBuilder.partialSign()
  const witnessSet = new TransactionWitnessSet.TransactionWitnessSet({
    nativeScripts: unsignedTransaction.witnessSet.nativeScripts,
    vkeyWitnesses: localWitness.vkeyWitnesses,
  })
  const partiallySigned = new Transaction.Transaction({
    body: unsignedTransaction.body,
    witnessSet,
    isValid: unsignedTransaction.isValid,
    auxiliaryData: unsignedTransaction.auxiliaryData,
  })

  return Transaction.toCBORHex(partiallySigned)
}

export const mintCip25 = async (
  recipientBech32: string,
  tokenName: string,
  nativeTokenAmount: bigint,
  metadataName: string,
  image: string,
  description: string,
) => {
  const client = Client.make(preprod)
    .withBlockfrost({
      baseUrl: BLOCKFROST_PREPROD_URL,
      projectId: loadBlockfrostProjectId(),
    })
    .withSeed({
      mnemonic: loadMnemonic(),
      accountIndex: 0,
    })
  const localAddress = await client.address()
  const recipientAddress = Address.fromBech32(recipientBech32)
  const localKeyHash = expectKeyHash(localAddress.paymentCredential, "local payment credential")
  const signerScript = NativeScripts.makeScriptPubKey(KeyHash.toBytes(localKeyHash))
  const expiryScript = NativeScripts.makeInvalidHereafter(Time.getSlotAt(MINT_POLICY_TTL_MS, "Preprod"))
  const mintPolicy = NativeScripts.makeScriptAll([signerScript.script, expiryScript.script])
  const policyId = ScriptHash.fromScript(mintPolicy)
  const policyIdHex = ScriptHash.toHex(policyId)
  const assetNameBytes = textToAssetNameBytes(tokenName)
  const assetNameHex = bytesToHex(assetNameBytes)
  const expiresAt = BigInt(Date.now() + MINT_POLICY_TTL_MS)
  const metadata = TransactionMetadatum.fromEntries([
    [ScriptHash.toBytes(policyId), TransactionMetadatum.fromEntries([[assetNameBytes, cip25TokenMetadata(metadataName, image, description)]])],
    ["version", 2n],
  ])

  const tx = await client
    .newTx()
    .attachScript({ script: mintPolicy })
    .mintAssets({ assets: Assets.fromHexStrings(policyIdHex, assetNameHex, nativeTokenAmount) })
    .payToAddress({
      address: recipientAddress,
      assets: Assets.fromHexStrings(policyIdHex, assetNameHex, nativeTokenAmount, MINT_OUTPUT_MIN_LOVELACE),
    })
    .attachMetadata({ label: 721n, metadata })
    .setValidity({ to: expiresAt })
    .build()

  const signed = await tx.sign()
  const txHash = await signed.submit()
  return TransactionHash.toHex(txHash)
}

export const partialSignCbor = async (unsignedTxCbor: string) => {
  const client = Client.make(preprod)
    .withBlockfrost({
      baseUrl: BLOCKFROST_PREPROD_URL,
      projectId: loadBlockfrostProjectId(),
    })
    .withSeed({
      mnemonic: loadMnemonic(),
      accountIndex: 0,
    })

  const witnessSet = await client.signTx(unsignedTxCbor)
  return TransactionWitnessSet.toCBORHex(witnessSet)
}

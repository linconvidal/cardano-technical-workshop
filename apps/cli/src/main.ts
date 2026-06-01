import {
  buildMultisigPartialCbor,
  buildPaymentCborFromSeedAddress,
  buildPaymentCborWithMetadataFromSeedAddress,
  describeMultisig,
  describeWallet,
  lockAdaAtMultisig,
  mintCip25,
  partialSignCbor,
  sendAda,
} from "../../../packages/cardano/src/cli/seed-workflows.js"

const usage = `Commands:
  address
  send-ada <addr_test...> <lovelace>
  build-cbor <addr_test...> <lovelace>
  build-cbor-metadata <addr_test...> <lovelace> <message>
  multisig-info <second-signer-addr_test...>
  lock-multisig <second-signer-addr_test...> <lovelace>
  build-multisig-partial <second-signer-addr_test...> <destination-addr_test...> <lovelace> <script-utxo-outref>
  mint-cip25 <recipient-addr_test...> <tokenName> <amount> <metadataName> <imageUri> <description>
  sign-cbor <unsigned_tx_cbor>

Environment:
  BLOCKFROST_PROJECT_ID
  WALLET_MNEMONIC or local .seedphrase
`

const requireArg = (value: string | undefined, label: string) => {
  if (value) return value
  throw new Error(`Missing ${label}`)
}

const parseLovelace = (value: string | undefined, label = "lovelace amount") => BigInt(requireArg(value, label))

const main = async () => {
  const [command, first, second, third, fourth, fifth, sixth] = process.argv.slice(2)

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage)
    return
  }

  if (command === "address") {
    const wallet = await describeWallet()
    console.log(`Address from seed: ${wallet.addressBech32}`)
    console.log(`Address hex: ${wallet.addressHex}`)
    console.log(`Payment key hash: ${wallet.paymentKeyHash}`)
    if (wallet.stakingKeyHash) console.log(`Staking key hash: ${wallet.stakingKeyHash}`)
    return
  }

  if (command === "send-ada") {
    const txHash = await sendAda(requireArg(first, "destination address"), parseLovelace(second))
    console.log(`Transaction submitted: ${txHash}`)
    return
  }

  if (command === "build-cbor") {
    const cbor = await buildPaymentCborFromSeedAddress(requireArg(first, "destination address"), parseLovelace(second))
    console.log(cbor)
    return
  }

  if (command === "build-cbor-metadata") {
    const cbor = await buildPaymentCborWithMetadataFromSeedAddress(
      requireArg(first, "destination address"),
      parseLovelace(second),
      requireArg(third, "metadata message"),
    )
    console.log(cbor)
    return
  }

  if (command === "multisig-info") {
    const multisig = describeMultisig(requireArg(first, "second signer address"))
    console.log(`Local address: ${multisig.localAddress}`)
    console.log(`Script address: ${multisig.scriptAddress}`)
    console.log(`Policy/script hash: ${multisig.policyId}`)
    console.log(`Native script CBOR: ${multisig.nativeScriptCbor}`)
    console.log(`Required signers: ${multisig.requiredSigners.join(", ")}`)
    return
  }

  if (command === "lock-multisig") {
    const txHash = await lockAdaAtMultisig(requireArg(first, "second signer address"), parseLovelace(second))
    console.log(`Lock transaction submitted: ${txHash}`)
    return
  }

  if (command === "build-multisig-partial") {
    const cbor = await buildMultisigPartialCbor(
      requireArg(first, "second signer address"),
      requireArg(second, "destination address"),
      parseLovelace(third),
      requireArg(fourth, "script UTxO outRef"),
    )
    console.log(cbor)
    return
  }

  if (command === "mint-cip25") {
    const txHash = await mintCip25(
      requireArg(first, "recipient address"),
      requireArg(second, "token name"),
      parseLovelace(third, "mint amount"),
      requireArg(fourth, "metadata name"),
      requireArg(fifth, "image URI"),
      requireArg(sixth, "description"),
    )
    console.log(`Mint transaction submitted: ${txHash}`)
    return
  }

  if (command === "sign-cbor") {
    const witnessCbor = await partialSignCbor(requireArg(first, "unsigned tx CBOR"))
    console.log(witnessCbor)
    return
  }

  throw new Error(`Unknown command: ${command}\n\n${usage}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

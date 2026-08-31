import assert from "node:assert/strict"
import test from "node:test"

import { KeyHash, ScriptHash } from "@evolution-sdk/evolution"

import { buildPaymentTx } from "./01-payment.js"
import { buildMetadataTx } from "./02-metadata.js"
import { buildMintTx } from "./03-mint-cip25.js"
import {
  EAC_ASSET_NAME,
  EAC_ISSUANCE_AMOUNT,
  EAC_REMAINING_AMOUNT,
  EAC_RETIREMENT_AMOUNT,
  buildEacMintTx,
  buildEacRetirementTx,
  makeEacMintPolicy,
} from "./04a-mint-eac.js"
import {
  buildMultisigLockTx,
  buildMultisigUnlockTx,
  describeMultisig,
} from "./04-multisig.js"
import {
  addressFor,
  assetQuantityAt,
  blockfrostUtxo,
  installControlledBlockfrost,
  lovelace,
  mintQuantity,
  outputLovelaceAt,
  transaction,
} from "./workshop-builder-test-fixture.js"

test("workshop builders execute against controlled Blockfrost evidence", async (context) => {
  const blockfrost = installControlledBlockfrost()
  const { requests, utxosByAddress } = blockfrost

  const userAddress = addressFor("1")
  const recipientAddress = addressFor("2")
  const secondSignerAddress = addressFor("3")
  const destinationAddress = addressFor("4")
  const baseUtxo = blockfrostUtxo(userAddress, "a".repeat(64), [lovelace()])

  try {
    await context.test("payment builder selects a real input and emits the requested output", async () => {
      utxosByAddress.set(userAddress, [baseUtxo])
      const result = await buildPaymentTx({ userAddress, recipientAddress, lovelace: 2_000_000n })
      const tx = transaction(result.txCbor)

      assert.equal(result.details.kind, "payment")
      assert.equal(tx.body.inputs.length, 1)
      assert.equal(outputLovelaceAt(tx, recipientAddress), 2_000_000n)
      assert.ok(tx.body.fee > 0n)
    })

    await context.test("metadata builder attaches label 674 to the built transaction", async () => {
      utxosByAddress.set(userAddress, [baseUtxo])
      const result = await buildMetadataTx({
        userAddress,
        recipientAddress,
        lovelace: 2_000_000n,
        message: "Hello, Cardano!",
      })
      const tx = transaction(result.txCbor)

      assert.equal(result.details.kind, "metadata-payment")
      assert.equal(outputLovelaceAt(tx, recipientAddress), 2_000_000n)
      assert.equal(tx.auxiliaryData?.metadata?.has(674n), true)
    })

    await context.test("CIP-25 builder mints and allocates the requested native asset", async () => {
      utxosByAddress.set(userAddress, [baseUtxo])
      const result = await buildMintTx({
        userAddress,
        recipientAddress,
        tokenName: "MyLittleToken",
        amount: 10n,
        metadataName: "My Little Token",
        image: "ipfs://workshop",
        description: "Workshop token",
      })
      const tx = transaction(result.txCbor)
      const policyId = String(result.details.policyId)
      const assetName = String(result.details.assetNameHex)

      assert.equal(result.details.kind, "cip25-mint")
      assert.equal(assetQuantityAt(tx, recipientAddress, policyId, assetName), "10")
      assert.equal(tx.auxiliaryData?.metadata?.has(721n), true)
      assert.equal(tx.body.requiredSigners?.length, 1)
      assert.ok(tx.body.ttl !== undefined)
    })

    await context.test("multisig lock and unlock builders materialize both ledger transitions", async () => {
      utxosByAddress.set(userAddress, [baseUtxo])
      const multisig = describeMultisig({ userAddress, secondSignerAddress })
      const lock = await buildMultisigLockTx({ userAddress, secondSignerAddress, lovelace: 10_000_000n })
      assert.equal(outputLovelaceAt(transaction(lock.txCbor), multisig.scriptAddress), 10_000_000n)

      const scriptUtxo = blockfrostUtxo(multisig.scriptAddress, "c".repeat(64), [lovelace("20000000")])
      utxosByAddress.set(multisig.scriptAddress, [scriptUtxo])
      const unlock = await buildMultisigUnlockTx({
        userAddress,
        secondSignerAddress,
        destinationAddress,
        lovelace: 2_000_000n,
        scriptUtxo: `${"c".repeat(64)}#0`,
      })
      const unlockTx = transaction(unlock.txCbor)

      assert.equal(outputLovelaceAt(unlockTx, destinationAddress), 2_000_000n)
      assert.equal(unlockTx.body.requiredSigners?.length, 2)
      assert.equal(unlock.details.selectedScriptUtxo, `${"c".repeat(64)}#0`)
    })

    await context.test("EAC builders issue integer base units and retire the fixed partial amount", async () => {
      utxosByAddress.set(userAddress, [baseUtxo])
      const issuance = await buildEacMintTx({
        userAddress,
        recipientAddress: userAddress,
        metadata: {
          version: 1,
          unit: "EAC",
          decimals: 3,
          methodology_hash: "a".repeat(64),
          assurance_hash: "b".repeat(64),
          evidence_root: "c".repeat(64),
        },
      })
      const policyId = String(issuance.details.policyId)
      const assetName = String(issuance.details.assetNameHex)
      const issuanceTx = transaction(issuance.txCbor)

      assert.equal(assetQuantityAt(issuanceTx, userAddress, policyId, assetName), EAC_ISSUANCE_AMOUNT.toString())
      assert.equal(issuanceTx.auxiliaryData?.metadata?.has(65_536n), true)

      const expectedPolicy = ScriptHash.toHex(ScriptHash.fromScript(makeEacMintPolicy(
        KeyHash.fromHex("1".repeat(56)),
      )))
      assert.equal(policyId, expectedPolicy)
      const indexedAsset = `${policyId}${Buffer.from(EAC_ASSET_NAME, "utf8").toString("hex")}`
      utxosByAddress.set(userAddress, [blockfrostUtxo(userAddress, "d".repeat(64), [
        lovelace(),
        { unit: indexedAsset, quantity: EAC_ISSUANCE_AMOUNT.toString() },
      ])])

      const retirement = await buildEacRetirementTx({
        userAddress,
        metadata: {
          version: 1,
          declaration_hash: "d".repeat(64),
          delivery_reference_hash: "e".repeat(64),
        },
      })
      const retirementTx = transaction(retirement.txCbor)

      assert.equal(mintQuantity(retirementTx, policyId, assetName), -EAC_RETIREMENT_AMOUNT)
      assert.equal(assetQuantityAt(retirementTx, userAddress, policyId, assetName), EAC_REMAINING_AMOUNT.toString())
      assert.equal(retirementTx.auxiliaryData?.metadata?.has(65_536n), true)
    })

    assert.ok(requests.some((url) => url.endsWith("/epochs/latest/parameters")))
    assert.ok(requests.some((url) => url.includes("/addresses/")))
  } finally {
    blockfrost.restore()
  }
})

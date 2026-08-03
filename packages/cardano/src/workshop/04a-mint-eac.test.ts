import assert from "node:assert/strict"
import test from "node:test"

import { KeyHash, NativeScripts, ScriptHash } from "@evolution-sdk/evolution"

import {
  EAC_ASSET_NAME,
  EAC_ISSUANCE_AMOUNT,
  EAC_METADATA_LABEL,
  EAC_REMAINING_AMOUNT,
  EAC_RETIREMENT_AMOUNT,
  eacIssuanceMetadata,
  eacRetirementMetadata,
  makeEacMintPolicy,
} from "./04a-mint-eac.js"

const fixtureMetadata = {
  version: 1 as const,
  unit: "EAC" as const,
  decimals: 3 as const,
  methodology_hash: "1".repeat(64),
  assurance_hash: "2".repeat(64),
  evidence_root: "3".repeat(64),
}

test("EAC issuance constants match the ADR-002 accounting unit", () => {
  assert.equal(EAC_ASSET_NAME, "EAC-BRE-2025P01")
  assert.equal(EAC_ISSUANCE_AMOUNT, 12_088_322n)
  assert.equal(EAC_METADATA_LABEL, 65_536n)
  assert.equal(EAC_RETIREMENT_AMOUNT, 125_000n)
  assert.equal(EAC_REMAINING_AMOUNT, 11_963_322n)
})

test("EAC issuance metadata contains exactly the raw evidence schema", () => {
  const metadata = eacIssuanceMetadata(fixtureMetadata)

  assert.deepEqual([...metadata], [
    ["version", 1n],
    ["unit", "EAC"],
    ["decimals", 3n],
    ["methodology_hash", fixtureMetadata.methodology_hash],
    ["assurance_hash", fixtureMetadata.assurance_hash],
    ["evidence_root", fixtureMetadata.evidence_root],
  ])
  assert.equal(metadata.has("asset_name"), false)
  assert.equal(metadata.has("action"), false)
  assert.equal(metadata.has("quantity"), false)
})

test("EAC retirement metadata links declaration and delivery without accounting duplication", () => {
  const metadata = eacRetirementMetadata({
    version: 1,
    declaration_hash: "4".repeat(64),
    delivery_reference_hash: "5".repeat(64),
  })

  assert.deepEqual([...metadata], [
    ["version", 1n],
    ["declaration_hash", "4".repeat(64)],
    ["delivery_reference_hash", "5".repeat(64)],
  ])
  assert.equal(metadata.has("action"), false)
  assert.equal(metadata.has("quantity"), false)
})

test("EAC signer policy is stable and contains no time-dependent script", () => {
  const keyHash = KeyHash.fromHex("a".repeat(56))
  const firstPolicy = makeEacMintPolicy(keyHash)
  const secondPolicy = makeEacMintPolicy(keyHash)
  const policyJson = JSON.stringify(NativeScripts.toJSON(firstPolicy.script))

  assert.equal(ScriptHash.toHex(ScriptHash.fromScript(firstPolicy)), ScriptHash.toHex(ScriptHash.fromScript(secondPolicy)))
  assert.match(policyJson, /sig/i)
  assert.doesNotMatch(policyJson, /before|after|slot|invalid/i)
})

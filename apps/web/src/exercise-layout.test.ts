import assert from "node:assert/strict"
import test from "node:test"

import { contractIconKeys, exerciseLayoutDefinitions } from "./exercise-layout.js"

test("every transaction flow exposes the shared semantic rail", () => {
  assert.deepEqual(
    exerciseLayoutDefinitions.map(({ id }) => id),
    [
      "payment",
      "metadata",
      "multisigSetup",
      "multisigLock",
      "multisigUnlock",
      "eacMint",
      "eacRetire",
      "mint",
    ],
  )

  for (const definition of exerciseLayoutDefinitions.filter(({ id }) => id !== "multisigSetup")) {
    assert.deepEqual(
      definition.zones.map(({ kind }) => kind),
      ["inputs", "steps", "current", "outputs", "confirmation"],
      `${definition.id} must preserve the five shared zones`,
    )
  }

  const setup = exerciseLayoutDefinitions.find(({ id }) => id === "multisigSetup")
  assert.deepEqual(
    setup?.zones.map(({ kind }) => kind),
    ["inputs", "current", "outputs", "confirmation"],
  )
})

test("exercise contracts cover every semantic icon variant", () => {
  assert.deepEqual(contractIconKeys, [
    "common.objective",
    "common.completedWhen",
    "common.submissionEffect",
    "common.risk",
    "common.limit",
  ])
})

test("layout definitions use unique roots and direct-child boundaries", () => {
  assert.equal(
    new Set(exerciseLayoutDefinitions.map(({ root }) => root)).size,
    exerciseLayoutDefinitions.length,
  )

  for (const definition of exerciseLayoutDefinitions) {
    assert.match(definition.root, /^#[A-Za-z][A-Za-z0-9]+$/)
    for (const zone of definition.zones) {
      assert.match(zone.first, /^:scope > /)
      assert.match(zone.last, /^:scope > /)
    }
  }
})

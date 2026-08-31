import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

import {
  extractCodeExcerpt,
  githubSourceHref,
  stepCodeDefinitions,
  stepCodeFlowIds,
  stepCodeFlowRoots,
  stepCodeSourcePaths,
  type StepCodeSources,
} from "./step-code-catalog.js"

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url))
const sources = Object.fromEntries(Object.entries(stepCodeSourcePaths).map(([id, path]) => [
  id,
  readFileSync(`${repositoryRoot}${path}`, "utf8"),
])) as StepCodeSources

test("every transaction pipeline exposes code for all five steps", () => {
  assert.deepEqual(stepCodeFlowIds, [
    "payment",
    "metadata",
    "multisigLock",
    "multisigUnlock",
    "eacMint",
    "eacRetire",
    "mint",
  ])
  assert.deepEqual(Object.keys(stepCodeFlowRoots), [...stepCodeFlowIds])

  for (const flowId of stepCodeFlowIds) {
    assert.equal(stepCodeDefinitions[flowId].length, 5, `${flowId} must map all pipeline steps`)
    assert.match(stepCodeFlowRoots[flowId], /^#[A-Za-z][A-Za-z0-9]+$/)
  }
})

test("every displayed excerpt is extracted from the current source file", () => {
  for (const flowId of stepCodeFlowIds) {
    for (const [stepIndex, definition] of stepCodeDefinitions[flowId].entries()) {
      assert.ok(definition.excerpts.length > 0, `${flowId} step ${stepIndex + 1} must expose source`)
      for (const excerptDefinition of definition.excerpts) {
        const excerpt = extractCodeExcerpt(sources, excerptDefinition)
        assert.ok(excerpt.code.trimStart().startsWith(excerptDefinition.from.trimStart()))
        assert.ok(excerpt.code.length > 80)
        assert.ok(excerpt.startLine > 0)
        assert.ok(excerpt.endLine >= excerpt.startLine)
        assert.equal(excerpt.path, stepCodeSourcePaths[excerptDefinition.source])
      }
    }
  }
})

test("source links require the exact build revision", () => {
  const excerpt = extractCodeExcerpt(sources, stepCodeDefinitions.payment[0].excerpts[0])
  const revision = "a".repeat(40)

  assert.equal(
    githubSourceHref(excerpt, revision),
    `https://github.com/linconvidal/cardano-technical-workshop/blob/${revision}/${excerpt.path}#L${excerpt.startLine}-L${excerpt.endLine}`,
  )
  assert.equal(githubSourceHref(excerpt, ""), undefined)
  assert.equal(githubSourceHref(excerpt, "main"), undefined)
})

test("multisig handoff shows both Cardano execution and browser import handling", () => {
  assert.deepEqual(
    stepCodeDefinitions.multisigUnlock[0].excerpts.map((excerpt) => excerpt.source),
    ["multisig", "flowController"],
  )
  assert.deepEqual(
    stepCodeDefinitions.multisigUnlock[1].excerpts.map((excerpt) => excerpt.source),
    ["wallet", "flowController"],
  )
})

import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import test from "node:test"

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url))
const tsxCli = fileURLToPath(new URL("../../../node_modules/tsx/dist/cli.mjs", import.meta.url))

const runCli = (args: ReadonlyArray<string>, environment: NodeJS.ProcessEnv = {}) => new Promise<{
  exitCode: number
  stdout: string
  stderr: string
}>((resolve, reject) => {
  const child = spawn(process.execPath, [tsxCli, "apps/cli/src/main.ts", ...args], {
    cwd: repositoryRoot,
    env: { ...process.env, CARDANO_NETWORK: "preprod", ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
  child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
  child.once("error", reject)
  child.once("exit", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }))
})

test("CLI dispatches help and address while rejecting invalid arguments", async () => {
  const help = await runCli(["--help"])
  assert.equal(help.exitCode, 0)
  assert.match(help.stdout, /Commands:\n  address/)
  assert.match(help.stdout, /CARDANO_NETWORK/u)
  assert.equal(help.stderr, "")

  const address = await runCli(["address"], {
    WALLET_MNEMONIC: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  })
  assert.equal(address.exitCode, 0)
  assert.match(address.stdout, /Address from seed: addr_test/)
  assert.match(address.stdout, /Payment key hash: [0-9a-f]{56}/)
  assert.equal(address.stderr, "")

  const missing = await runCli(["send-ada"])
  assert.equal(missing.exitCode, 1)
  assert.equal(missing.stdout, "")
  assert.match(missing.stderr, /Missing destination address/)

  const unknown = await runCli(["not-a-command"])
  assert.equal(unknown.exitCode, 1)
  assert.match(unknown.stderr, /Unknown command: not-a-command/)
})

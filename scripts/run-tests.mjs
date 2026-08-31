import { spawn } from "node:child_process"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))
const tsxCli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url))

const findTests = async (directory) => {
  const tests = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) tests.push(...await findTests(path))
    else if (entry.isFile() && entry.name.endsWith(".test.ts")) tests.push(path)
  }
  return tests
}

const testFiles = (await Promise.all([
  findTests(join(repositoryRoot, "apps")),
  findTests(join(repositoryRoot, "packages")),
])).flat().sort()

if (testFiles.length === 0) throw new Error("No *.test.ts files were discovered")
console.log(`Discovered ${testFiles.length} test files.`)

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [tsxCli, "--test", ...testFiles], {
    cwd: repositoryRoot,
    stdio: "inherit",
  })
  child.once("error", reject)
  child.once("exit", (code) => resolve(code ?? 1))
})

process.exitCode = exitCode

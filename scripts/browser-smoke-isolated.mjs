import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url))
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const waitForExit = async (child, timeout) => {
  if (child.exitCode !== null) return
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(timeout),
  ])
}

const waitForReadiness = async (url, child) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Isolated backend exited with code ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.status === 200) return
    } catch {
      // The backend is still starting.
    }
    await delay(100)
  }
  throw new Error(`Isolated backend did not become reachable at ${url}`)
}

const run = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env,
    stdio: "inherit",
  })
  child.once("error", reject)
  child.once("exit", (code) => resolve(code ?? 1))
})

const main = async () => {
  const buildExitCode = await run(npmCommand, ["run", "build"], process.env)
  if (buildExitCode !== 0) throw new Error(`Workbench build failed with code ${buildExitCode}`)

  const port = 8_800 + process.pid % 500
  const workbenchUrl = `http://127.0.0.1:${port}`
  const serverEnvironment = {
    ...process.env,
    CARDANO_NETWORK: "preprod",
    HOST: "127.0.0.1",
    PORT: String(port),
  }
  delete serverEnvironment.BLOCKFROST_PROJECT_ID

  const server = spawn(process.execPath, ["--import", "tsx", "apps/api/src/server.ts"], {
    cwd: repositoryRoot,
    env: serverEnvironment,
    stdio: ["ignore", "inherit", "inherit"],
  })

  try {
    await waitForReadiness(`${workbenchUrl}/api/readiness`, server)
    const smokeExitCode = await run(process.execPath, ["scripts/browser-smoke.mjs"], {
      ...process.env,
      WORKBENCH_URL: workbenchUrl,
    })
    if (smokeExitCode !== 0) process.exitCode = smokeExitCode
  } finally {
    server.kill("SIGTERM")
    await waitForExit(server, 5_000)
    if (server.exitCode === null) server.kill("SIGKILL")
  }
}

await main()

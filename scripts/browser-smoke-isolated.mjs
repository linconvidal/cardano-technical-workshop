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
    if (child.exitCode !== null) throw new Error(`Isolated server exited with code ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.status === 200) return
    } catch {
      // The owned server is still starting.
    }
    await delay(100)
  }
  throw new Error(`Isolated server did not become reachable at ${url}`)
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

const checkMode = async (mode) => {
  const staticMode = mode === "static"
  const buildExitCode = await run(npmCommand, ["run", staticMode ? "build:static" : "build"], process.env)
  if (buildExitCode !== 0) throw new Error(`${mode} build failed with code ${buildExitCode}`)

  const port = 8_800 + process.pid % 400 + (staticMode ? 1 : 0)
  const workbenchUrl = `http://127.0.0.1:${port}`
  const environment = { ...process.env, CARDANO_NETWORK: "preprod", HOST: "127.0.0.1", PORT: String(port) }
  delete environment.BLOCKFROST_PROJECT_ID
  const args = staticMode
    ? ["node_modules/vite/bin/vite.js", "preview", "--mode", "static", "--host", "127.0.0.1", "--port", String(port), "--strictPort"]
    : ["--import", "tsx", "apps/api/src/server.ts"]
  const server = spawn(process.execPath, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: ["ignore", "inherit", "inherit"],
  })

  try {
    await waitForReadiness(staticMode ? workbenchUrl : `${workbenchUrl}/api/health`, server)
    return await run(process.execPath, ["--import", "tsx", "scripts/browser-smoke.mjs", ...(staticMode ? ["--static"] : [])], {
      ...environment,
      WORKBENCH_URL: workbenchUrl,
    })
  } finally {
    server.kill("SIGTERM")
    await waitForExit(server, 5_000)
    if (server.exitCode === null) server.kill("SIGKILL")
  }
}

for (const mode of ["api", "static"]) {
  const code = await checkMode(mode)
  if (code !== 0) { process.exitCode = code; break }
}

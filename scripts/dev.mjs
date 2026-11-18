import { once } from "node:events"
import { createServer } from "vite"
import { startServer } from "../apps/api/src/server.ts"

// Both servers belong to this process; shutdown closes only these instances.
const api = startServer()
let web
let closing = false
const close = async () => {
  if (closing) return
  closing = true
  await web?.close()
  if (api.listening) await new Promise((resolve, reject) => api.close((error) => error ? reject(error) : resolve()))
}

try {
  await once(api, "listening")
  web = await createServer({ mode: "development" })
  await web.listen()
  web.printUrls()
} catch (error) {
  await close()
  throw error
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => { void close().catch((error) => { console.error(error); process.exitCode = 1 }) })
}

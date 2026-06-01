import { Client, Transaction, TransactionHash, preprod } from "@evolution-sdk/evolution"
import express from "express"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { BLOCKFROST_PREPROD_URL, loadBlockfrostProjectId } from "../../../packages/cardano/src/internal/blockfrost-client.js"
import { buildPaymentTx } from "../../../packages/cardano/src/workshop/01-payment.js"
import { buildMetadataTx } from "../../../packages/cardano/src/workshop/02-metadata.js"
import { buildMintTx } from "../../../packages/cardano/src/workshop/03-mint-cip25.js"
import {
  buildMultisigLockTx,
  buildMultisigUnlockTx,
  describeMultisig,
  listMultisigScriptUtxos,
} from "../../../packages/cardano/src/workshop/04-multisig.js"
import {
  parseMetadataRequest,
  parseMintRequest,
  parseMultisigLockRequest,
  parseMultisigRequest,
  parseMultisigUnlockRequest,
  parsePaymentRequest,
  parseSubmitTxRequest,
} from "./request-validation.js"

const app = express()
const port = Number(process.env.PORT ?? 8787)
const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, "..", "..", "..", "dist")

type AsyncRouteHandler = (req: express.Request, res: express.Response) => Promise<unknown> | unknown

const asyncRoute = (handler: AsyncRouteHandler): express.RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res)).catch(next)
}

app.use(express.json({ limit: "2mb" }))

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "cardano-technical-workshop" })
})

app.post("/api/workshop/01-payment", asyncRoute(async (req, res) => {
  res.json(await buildPaymentTx(parsePaymentRequest(req.body)))
}))

app.post("/api/workshop/02-metadata", asyncRoute(async (req, res) => {
  res.json(await buildMetadataTx(parseMetadataRequest(req.body)))
}))

app.post("/api/workshop/03-mint-cip25", asyncRoute(async (req, res) => {
  res.json(await buildMintTx(parseMintRequest(req.body)))
}))

app.post("/api/workshop/04-multisig/describe", asyncRoute((req, res) => {
  res.json(describeMultisig(parseMultisigRequest(req.body)))
}))

app.post("/api/workshop/04-multisig/lock", asyncRoute(async (req, res) => {
  res.json(await buildMultisigLockTx(parseMultisigLockRequest(req.body)))
}))

app.post("/api/workshop/04-multisig/utxos", asyncRoute(async (req, res) => {
  res.json(await listMultisigScriptUtxos(parseMultisigRequest(req.body)))
}))

app.post("/api/workshop/04-multisig/unlock", asyncRoute(async (req, res) => {
  res.json(await buildMultisigUnlockTx(parseMultisigUnlockRequest(req.body)))
}))

app.post("/api/submit-tx", asyncRoute(async (req, res) => {
  const signedTxCbor = parseSubmitTxRequest(req.body)
  const provider = Client.make(preprod).withBlockfrost({
    baseUrl: BLOCKFROST_PREPROD_URL,
    projectId: loadBlockfrostProjectId(),
  })
  const txHash = await provider.submitTx(Transaction.fromCBORHex(signedTxCbor))

  res.json({ txHash: TransactionHash.toHex(txHash) })
}))

if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next()
    return res.sendFile(join(distPath, "index.html"))
  })
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error)
  res.status(400).json({ error: message })
})

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend listening on http://0.0.0.0:${port}`)
})

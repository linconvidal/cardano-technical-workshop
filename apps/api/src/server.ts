import express from "express"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  getAddressReadiness,
  getBlockfrostReadiness,
  getTransactionInclusion,
  submitTransaction,
} from "../../../packages/cardano/src/internal/blockfrost-client.js"
import { PUBLIC_WORKSHOP_NETWORK_CONFIG } from "../../../packages/cardano/src/internal/network-config.js"
import { buildPaymentTx } from "../../../packages/cardano/src/workshop/01-payment.js"
import { buildMetadataTx } from "../../../packages/cardano/src/workshop/02-metadata.js"
import { buildMintTx } from "../../../packages/cardano/src/workshop/03-mint-cip25.js"
import {
  buildEacMintTx,
  buildEacRetirementTx,
} from "../../../packages/cardano/src/workshop/04a-mint-eac.js"
import {
  buildMultisigLockTx,
  buildMultisigUnlockTx,
  describeMultisig,
  listMultisigScriptUtxos,
  verifyMultisigScriptUtxo,
} from "../../../packages/cardano/src/workshop/04-multisig.js"
import {
  formatMessage,
  messageRef,
  resolveLocale,
  type Locale,
} from "../../../packages/localization/src/index.js"
import {
  ApiError,
  localizeApiProblem,
  toApiProblem,
} from "../../../packages/cardano/src/workshop/api-error.js"
import {
  parseEacMintRequest,
  parseEacRetireRequest,
  parseMetadataRequest,
  parseMintRequest,
  parseMultisigInputVerificationRequest,
  parseMultisigLockRequest,
  parseMultisigRequest,
  parseMultisigUnlockRequest,
  parsePaymentRequest,
  parseSubmitTxRequest,
  parseTestnetAddress,
  parseTransactionHash,
} from "../../../packages/cardano/src/workshop/request-validation.js"

export const app = express()
app.disable("x-powered-by")
const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? "127.0.0.1"
const __dirname = dirname(fileURLToPath(import.meta.url))
const distPath = join(__dirname, "..", "..", "..", "dist")

type AsyncRouteHandler = (req: express.Request, res: express.Response) => Promise<unknown> | unknown

const asyncRoute = (handler: AsyncRouteHandler): express.RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res)).catch(next)
}

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next()
  const locale = requestLocale(req.get("accept-language"))
  res.locals.locale = locale
  res.set("Content-Language", locale)
  res.vary("Accept-Language")
  return next()
})
app.use(express.json({ limit: "2mb" }))

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "cardano-technical-workshop" })
})

app.get("/api/readiness", asyncRoute(async (req, res) => {
  const provider = await getBlockfrostReadiness()
  const address = typeof req.query.address === "string"
    ? parseTestnetAddress(req.query.address)
    : undefined

  const wallet = address && provider.healthy
    ? await getAddressReadiness(address)
    : undefined

  res.json({
    ok: provider.configured && provider.reachable && provider.healthy,
    network: PUBLIC_WORKSHOP_NETWORK_CONFIG,
    provider,
    wallet,
    note: formatMessage(messageRef("api.readiness.note"), res.locals.locale as Locale),
  })
}))

app.get("/api/transactions/:txHash/status", asyncRoute(async (req, res) => {
  res.json(await getTransactionInclusion(parseTransactionHash(req.params.txHash)))
}))

app.post("/api/workshop/01-payment", asyncRoute(async (req, res) => {
  res.json(await buildPaymentTx(parsePaymentRequest(req.body)))
}))

app.post("/api/workshop/02-metadata", asyncRoute(async (req, res) => {
  res.json(await buildMetadataTx(parseMetadataRequest(req.body)))
}))

app.post("/api/workshop/04a-mint-eac", asyncRoute(async (req, res) => {
  res.json(await buildEacMintTx(parseEacMintRequest(req.body)))
}))

app.post("/api/workshop/04a-retire-eac", asyncRoute(async (req, res) => {
  res.json(await buildEacRetirementTx(parseEacRetireRequest(req.body)))
}))

for (const path of [
  "/api/workshop/04b-mint-cip25",
  "/api/workshop/04-mint-cip25",
  "/api/workshop/03-mint-cip25",
]) {
  app.post(path, asyncRoute(async (req, res) => {
    res.json(await buildMintTx(parseMintRequest(req.body)))
  }))
}

for (const prefix of ["/api/workshop/03-multisig", "/api/workshop/04-multisig"]) {
  app.post(`${prefix}/describe`, asyncRoute((req, res) => {
    res.json(describeMultisig(parseMultisigRequest(req.body)))
  }))

  app.post(`${prefix}/lock`, asyncRoute(async (req, res) => {
    res.json(await buildMultisigLockTx(parseMultisigLockRequest(req.body)))
  }))

  app.post(`${prefix}/utxos`, asyncRoute(async (req, res) => {
    res.json(await listMultisigScriptUtxos(parseMultisigRequest(req.body)))
  }))

  app.post(`${prefix}/unlock`, asyncRoute(async (req, res) => {
    res.json(await buildMultisigUnlockTx(parseMultisigUnlockRequest(req.body)))
  }))

  app.post(`${prefix}/verify-input`, asyncRoute(async (req, res) => {
    const { scriptAddress, scriptUtxo } = parseMultisigInputVerificationRequest(req.body)
    res.json(await verifyMultisigScriptUtxo(scriptAddress, scriptUtxo))
  }))
}

app.post("/api/submit-tx", asyncRoute(async (req, res) => {
  const signedTxCbor = parseSubmitTxRequest(req.body)
  try {
    res.json(await submitTransaction(signedTxCbor))
  } catch (error) {
    const { status, problem } = toApiProblem(error, process.env.BLOCKFROST_PROJECT_ID?.trim())
    // An unclassified provider failure cannot establish that submission was rejected.
    throw new ApiError(status === 422 ? 502 : status, problem)
  }
}))

if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next()
    return res.sendFile(join(distPath, "index.html"))
  })
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const { status, problem } = toApiProblem(error, process.env.BLOCKFROST_PROJECT_ID?.trim())
  const locale = (res.locals.locale as Locale | undefined) ?? requestLocale(undefined)
  res.status(status).json({ error: localizeApiProblem(problem, locale) })
})

export const startServer = () => app.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`)
})

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : undefined
if (entrypoint === fileURLToPath(import.meta.url)) startServer()

const requestLocale = (acceptLanguage: string | undefined): Locale => {
  if (!acceptLanguage) return resolveLocale()
  const candidates = acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [language = "", ...parameters] = entry.trim().split(";")
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="))
      const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1
      return { language, quality: Number.isFinite(quality) ? quality : 0, index }
    })
    .filter(({ language, quality }) => language !== "*" && quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map(({ language }) => language)
  return resolveLocale(candidates)
}

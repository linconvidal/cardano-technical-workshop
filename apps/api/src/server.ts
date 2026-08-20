import { Client, Transaction, TransactionHash, preprod } from "@evolution-sdk/evolution"
import express from "express"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  BLOCKFROST_PREPROD_URL,
  BlockfrostHttpError,
  getAddressReadiness,
  getBlockfrostReadiness,
  getTransactionInclusion,
  loadBlockfrostProjectId,
} from "../../../packages/cardano/src/internal/blockfrost-client.js"
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
  insufficientFundsProblem,
  localizeApiProblem,
  workshopActionFailedProblem,
  type ApiProblem,
} from "./api-error.js"
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
} from "./request-validation.js"

const app = express()
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
    network: "preprod",
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
  const { status, problem } = toApiProblem(error)
  const locale = (res.locals.locale as Locale | undefined) ?? requestLocale(undefined)
  res.status(status).json({ error: localizeApiProblem(problem, locale) })
})

app.listen(port, host, () => {
  console.log(`Backend listening on http://${host}:${port}`)
})

const toApiProblem = (error: unknown): { status: number; problem: ApiProblem } => {
  if (error instanceof ApiError) return { status: error.status, problem: error.problem }

  if (error instanceof SyntaxError && "body" in error) {
    return {
      status: 400,
      problem: {
        code: "invalid_json",
        message: messageRef("api.invalidJson.message"),
        retryable: false,
        guidance: messageRef("api.invalidJson.guidance"),
        technicalDetail: redactTechnicalDetail(error.message),
      },
    }
  }

  if (error instanceof BlockfrostHttpError) {
    const authenticationFailure = error.status === 401 || error.status === 403
    const rateLimited = error.status === 429
    return {
      status: authenticationFailure || rateLimited ? 503 : 502,
      problem: {
        code: authenticationFailure
          ? "provider_authentication_failed"
          : rateLimited ? "provider_rate_limited" : "blockfrost_error",
        message: authenticationFailure
          ? messageRef("api.providerAuthenticationFailed.message")
          : rateLimited
            ? messageRef("api.providerRateLimited.message")
            : messageRef("api.blockfrostError.message"),
        retryable: rateLimited || error.status >= 500,
        guidance: authenticationFailure
          ? messageRef("api.providerAuthenticationFailed.guidance")
          : rateLimited
            ? messageRef("api.providerRateLimited.guidance")
            : messageRef("api.blockfrostError.guidance"),
        technicalDetail: redactTechnicalDetail(error.message),
      },
    }
  }

  const technicalDetail = redactTechnicalDetail(error instanceof Error ? error.message : String(error))
  if (technicalDetail.includes("Set BLOCKFROST_PROJECT_ID")) {
    return {
      status: 503,
      problem: {
        code: "provider_not_ready",
        message: messageRef("api.providerNotReady.message"),
        retryable: false,
        guidance: messageRef("api.providerNotReady.guidance"),
        technicalDetail,
      },
    }
  }

  if (/No UTxO found|Multiple script UTxOs|Script UTxO .* not found/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "script_utxo_unavailable",
        message: messageRef("api.scriptUtxoUnavailable.message"),
        retryable: true,
        guidance: messageRef("api.scriptUtxoUnavailable.guidance"),
        technicalDetail,
      },
    }
  }

  const insufficientFunds = insufficientFundsProblem(technicalDetail)
  if (insufficientFunds) return insufficientFunds

  if (/CIP-25|asset name|at most .* bytes/i.test(technicalDetail)) {
    return {
      status: 400,
      problem: {
        code: "invalid_asset_metadata",
        message: messageRef("api.invalidAssetMetadata.message"),
        retryable: false,
        guidance: messageRef("api.invalidAssetMetadata.guidance"),
        technicalDetail,
      },
    }
  }

  if (/CBOR|deseriali[sz]|decode|unexpected end/i.test(technicalDetail)) {
    return {
      status: 400,
      problem: {
        code: "invalid_transaction_cbor",
        message: messageRef("api.invalidTransactionCbor.message"),
        retryable: false,
        guidance: messageRef("api.invalidTransactionCbor.guidance"),
        technicalDetail,
      },
    }
  }

  if (/expired|validity interval|InvalidHereafter|outside.*validity/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "transaction_expired",
        message: messageRef("api.transactionExpired.message"),
        retryable: false,
        guidance: messageRef("api.transactionExpired.guidance"),
        technicalDetail,
      },
    }
  }

  if (/BadInputsUTxO|already spent|UTxO.*spent/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "input_already_spent",
        message: messageRef("api.inputAlreadySpent.message"),
        retryable: false,
        guidance: messageRef("api.inputAlreadySpent.guidance"),
        technicalDetail,
      },
    }
  }

  if (/429|rate.?limit|too many requests/i.test(technicalDetail)) {
    return {
      status: 503,
      problem: {
        code: "provider_rate_limited",
        message: messageRef("api.providerRateLimited.message"),
        retryable: true,
        guidance: messageRef("api.providerRateLimitedCurrentStep.guidance"),
        technicalDetail,
      },
    }
  }

  if (/401|403|unauthorized|forbidden|project.?id/i.test(technicalDetail)) {
    return {
      status: 503,
      problem: {
        code: "provider_authentication_failed",
        message: messageRef("api.providerAuthenticationFailed.message"),
        retryable: false,
        guidance: messageRef("api.providerAuthenticationFailed.guidance"),
        technicalDetail,
      },
    }
  }

  return workshopActionFailedProblem(technicalDetail)
}

const redactTechnicalDetail = (value: string): string => {
  const projectId = process.env.BLOCKFROST_PROJECT_ID?.trim()
  return projectId ? value.replaceAll(projectId, "[redacted Blockfrost project id]") : value
}

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

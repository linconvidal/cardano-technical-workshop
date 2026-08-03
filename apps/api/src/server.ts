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
import { ApiError, type ApiProblem } from "./api-error.js"
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
    note: "CIP-30 network id 0 confirms testnet, but the wallet must still be set explicitly to Preprod rather than Preview.",
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
  res.status(status).json({ error: problem })
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
        message: "O corpo da requisição não é JSON válido",
        retryable: false,
        guidance: "Corrija o JSON antes de enviar novamente.",
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
          ? "O Blockfrost recusou a credencial configurada"
          : rateLimited ? "O Blockfrost limitou temporariamente as requisições" : "A Preprod não respondeu como esperado",
        retryable: rateLimited || error.status >= 500,
        guidance: authenticationFailure
          ? "Revise BLOCKFROST_PROJECT_ID no backend e reinicie a Workbench."
          : rateLimited
            ? "Aguarde alguns segundos e tente novamente."
            : "Mantenha os artefatos atuais e tente novamente. Se persistir, confirme a configuração do Blockfrost.",
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
        message: "O backend ainda não tem uma credencial Blockfrost Preprod",
        retryable: false,
        guidance: "Configure BLOCKFROST_PROJECT_ID no backend e reinicie a Workbench.",
        technicalDetail,
      },
    }
  }

  if (/No UTxO found|Multiple script UTxOs|Script UTxO .* not found/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "script_utxo_unavailable",
        message: "O UTxO multisig escolhido não está disponível",
        retryable: true,
        guidance: "Liste os UTxOs novamente. Se o lock acabou de ser incluído, aguarde a indexação antes de repetir.",
        technicalDetail,
      },
    }
  }

  if (/insufficient|not enough|balance/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "insufficient_funds",
        message: "A wallet não possui saldo utilizável suficiente",
        retryable: false,
        guidance: "Confirme Preprod, receba tADA e construa novamente para selecionar UTxOs atuais.",
        technicalDetail,
      },
    }
  }

  if (/CIP-25|asset name|at most .* bytes/i.test(technicalDetail)) {
    return {
      status: 400,
      problem: {
        code: "invalid_asset_metadata",
        message: "Os campos do Native Asset não atendem aos limites",
        retryable: false,
        guidance: "Ajuste asset name ou metadata e construa uma nova transação.",
        technicalDetail,
      },
    }
  }

  if (/CBOR|deseriali[sz]|decode|unexpected end/i.test(technicalDetail)) {
    return {
      status: 400,
      problem: {
        code: "invalid_transaction_cbor",
        message: "O CBOR da transação não pôde ser decodificado",
        retryable: false,
        guidance: "Use o signed tx CBOR produzido pela etapa de anexar witnesses.",
        technicalDetail,
      },
    }
  }

  if (/expired|validity interval|InvalidHereafter|outside.*validity/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "transaction_expired",
        message: "A janela de validade da transação terminou",
        retryable: false,
        guidance: "Reinicie o exercício e construa uma nova transação antes de assinar ou submeter.",
        technicalDetail,
      },
    }
  }

  if (/BadInputsUTxO|already spent|UTxO.*spent/i.test(technicalDetail)) {
    return {
      status: 409,
      problem: {
        code: "input_already_spent",
        message: "Um input da transação já foi consumido",
        retryable: false,
        guidance: "Consulte novamente a rede e reconstrua a transação com UTxOs atuais.",
        technicalDetail,
      },
    }
  }

  if (/429|rate.?limit|too many requests/i.test(technicalDetail)) {
    return {
      status: 503,
      problem: {
        code: "provider_rate_limited",
        message: "O Blockfrost limitou temporariamente as requisições",
        retryable: true,
        guidance: "Aguarde alguns segundos e repita somente a etapa atual.",
        technicalDetail,
      },
    }
  }

  if (/401|403|unauthorized|forbidden|project.?id/i.test(technicalDetail)) {
    return {
      status: 503,
      problem: {
        code: "provider_authentication_failed",
        message: "O Blockfrost recusou a credencial configurada",
        retryable: false,
        guidance: "Revise BLOCKFROST_PROJECT_ID no backend e reinicie a Workbench.",
        technicalDetail,
      },
    }
  }

  return {
    status: 422,
    problem: {
      code: "workshop_action_failed",
      message: "A operação não pôde ser concluída",
      retryable: true,
      guidance: "Confira os campos e o estado da wallet. Preserve a última etapa válida e tente novamente.",
      technicalDetail,
    },
  }
}

const redactTechnicalDetail = (value: string): string => {
  const projectId = process.env.BLOCKFROST_PROJECT_ID?.trim()
  return projectId ? value.replaceAll(projectId, "[redacted Blockfrost project id]") : value
}

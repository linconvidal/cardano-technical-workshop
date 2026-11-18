import {
  getAddressReadiness, getBlockfrostReadiness, getTransactionInclusion,
  makeWorkshopBlockfrostClient, submitTransaction,
} from "../../../packages/cardano/src/internal/blockfrost-client.js"
import { PUBLIC_WORKSHOP_NETWORK_CONFIG } from "../../../packages/cardano/src/internal/network-config.js"
import { buildPaymentTx } from "../../../packages/cardano/src/workshop/01-payment.js"
import { buildMetadataTx } from "../../../packages/cardano/src/workshop/02-metadata.js"
import { buildMintTx } from "../../../packages/cardano/src/workshop/03-mint-cip25.js"
import { buildEacMintTx, buildEacRetirementTx } from "../../../packages/cardano/src/workshop/04a-mint-eac.js"
import {
  buildMultisigLockTx, buildMultisigUnlockTx, describeMultisig,
  listMultisigScriptUtxos, verifyMultisigScriptUtxo,
} from "../../../packages/cardano/src/workshop/04-multisig.js"
import { ApiError, toApiProblem } from "../../../packages/cardano/src/workshop/api-error.js"
import {
  parsePaymentRequest, parseMetadataRequest, parseMintRequest, parseEacMintRequest, parseEacRetireRequest,
  parseMultisigRequest, parseMultisigLockRequest, parseMultisigUnlockRequest,
  parseMultisigInputVerificationRequest, parseSubmitTxRequest, parseTransactionHash, parseTestnetAddress,
} from "../../../packages/cardano/src/workshop/request-validation.js"

import { executionMode } from "./execution-mode.js"
import { getJson, postJson } from "./http.js"

export const blockfrostStorageKey = "cardano-technical-workshop.blockfrost-project-id.v1"

export const getProjectId = (): string => {
  try { return globalThis.localStorage?.getItem(blockfrostStorageKey)?.trim() ?? "" }
  catch { return "" }
}

export const setProjectId = (value: string): void => {
  const key = value.trim()
  if (key) localStorage.setItem(blockfrostStorageKey, key)
  else localStorage.removeItem(blockfrostStorageKey)
}

const run = async <T>(action: (key: string) => T | Promise<T>, submitting = false): Promise<T> => {
  const key = getProjectId()
  try { return await action(key) }
  catch (error) {
    const { status, problem } = toApiProblem(error, key)
    // An unclassified submission failure is not evidence that the transaction was rejected.
    throw new ApiError(submitting && status === 422 ? 0 : status, problem)
  }
}

const build = <Input, Params, Result>(
  parse: (input: Input) => Params,
  construct: (params: Params, provider: ReturnType<typeof makeWorkshopBlockfrostClient>) => Promise<Result>,
) => (input: Input) => run((key) => construct(parse(input), makeWorkshopBlockfrostClient(key)))

export const browserWorkshop = {
  payment: build(parsePaymentRequest, buildPaymentTx),
  metadata: build(parseMetadataRequest, buildMetadataTx),
  mint: build(parseMintRequest, buildMintTx),
  eacMint: build(parseEacMintRequest, buildEacMintTx),
  eacRetire: build(parseEacRetireRequest, buildEacRetirementTx),
  multisigLock: build(parseMultisigLockRequest, buildMultisigLockTx),
  multisigUnlock: build(parseMultisigUnlockRequest, buildMultisigUnlockTx),
  multisigUtxos: build(parseMultisigRequest, listMultisigScriptUtxos),
  describeMultisig: (input: Parameters<typeof parseMultisigRequest>[0]) =>
    run(() => describeMultisig(parseMultisigRequest(input))),
  verifyInput: (input: Parameters<typeof parseMultisigInputVerificationRequest>[0]) => run((key) => {
    const { scriptAddress, scriptUtxo } = parseMultisigInputVerificationRequest(input)
    return verifyMultisigScriptUtxo(scriptAddress, scriptUtxo, makeWorkshopBlockfrostClient(key))
  }),
  submit: (signedTxCbor: string) => run((key) =>
    submitTransaction(parseSubmitTxRequest({ signedTxCbor }), key), true),
  checkStatus: (txHash: string) => run((key) =>
    getTransactionInclusion(parseTransactionHash(txHash), fetch, key)),
  readiness: (address?: string) => run(async (key) => {
    const provider = await getBlockfrostReadiness(fetch, key)
    const wallet = address && provider.healthy
      ? await getAddressReadiness(parseTestnetAddress(address), fetch, key)
      : undefined
    return { ok: provider.healthy, network: PUBLIC_WORKSHOP_NETWORK_CONFIG, provider, wallet }
  }),
}

// The HTTP adapter preserves the same UI contract; validation and builders run in Express.
export const apiWorkshop: typeof browserWorkshop = {
  payment: (input) => postJson("/api/workshop/01-payment", input),
  metadata: (input) => postJson("/api/workshop/02-metadata", input),
  mint: (input) => postJson("/api/workshop/04b-mint-cip25", input),
  eacMint: (input) => postJson("/api/workshop/04a-mint-eac", input),
  eacRetire: (input) => postJson("/api/workshop/04a-retire-eac", input),
  multisigLock: (input) => postJson("/api/workshop/03-multisig/lock", input),
  multisigUnlock: (input) => postJson("/api/workshop/03-multisig/unlock", input),
  multisigUtxos: (input) => postJson("/api/workshop/03-multisig/utxos", input),
  describeMultisig: (input) => postJson("/api/workshop/03-multisig/describe", input),
  verifyInput: (input) => postJson("/api/workshop/03-multisig/verify-input", input),
  submit: (signedTxCbor) => postJson("/api/submit-tx", { signedTxCbor }),
  checkStatus: (txHash) => getJson(`/api/transactions/${encodeURIComponent(txHash)}/status`),
  readiness: (address) => getJson(`/api/readiness${address ? `?address=${encodeURIComponent(address)}` : ""}`),
}

export const workshop = executionMode === "static" ? browserWorkshop : apiWorkshop

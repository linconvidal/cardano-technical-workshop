import "./styles.css"

import { Address, Client, preprod, TransactionWitnessSet } from "@evolution-sdk/evolution"

import { postJson } from "./http.js"
import {
  copyArtifact,
  hydrateArtifactBoxes,
  inputValue,
  mergeWitnesses,
  multisigWorkbench,
  renderJson,
  select,
  txWorkbench,
  type SubmitWorkbench,
  type TxBuildResponse,
  type TxWorkbench,
} from "./workbench-ui.js"

hydrateArtifactBoxes()

const walletNameInput = select<HTMLSelectElement>("#walletName")
const addressOutput = select<HTMLElement>("#connectedAddress")
const logOutput = select<HTMLPreElement>("#log")

type BrowserWalletClient = {
  address(): Promise<Address.Address>
  signTx(txCbor: string): Promise<TransactionWitnessSet.TransactionWitnessSet>
}

let walletClient: BrowserWalletClient | undefined
let userAddress: string | undefined

const payment = txWorkbench("payment")
const metadata = txWorkbench("metadata")
const mint = txWorkbench("mint")
const multisigLock = txWorkbench("multisigLock")
const multisigUnlock = multisigWorkbench("multisigUnlock")

bind("#connectWallet", connectWallet)
bind("#paymentBuild", buildPayment)
bind("#paymentSign", () => signWorkbench(payment))
bind("#paymentMerge", () => mergeWorkbench(payment))
bind("#paymentSubmit", () => submitWorkbench(payment))
bind("#metadataBuild", buildMetadata)
bind("#metadataSign", () => signWorkbench(metadata))
bind("#metadataMerge", () => mergeWorkbench(metadata))
bind("#metadataSubmit", () => submitWorkbench(metadata))
bind("#mintBuild", buildMint)
bind("#mintSign", () => signWorkbench(mint))
bind("#mintMerge", () => mergeWorkbench(mint))
bind("#mintSubmit", () => submitWorkbench(mint))
bind("#multisigDescribe", describeMultisig)
bind("#multisigListUtxos", listMultisigUtxos)
bind("#multisigLockBuild", buildMultisigLock)
bind("#multisigLockSign", () => signWorkbench(multisigLock))
bind("#multisigLockMerge", () => mergeWorkbench(multisigLock))
bind("#multisigLockSubmit", () => submitWorkbench(multisigLock))
bind("#multisigUnlockBuild", buildMultisigUnlock)
bind("#multisigUnlockSignA", signMultisigUnlock)
bind("#multisigUnlockMerge", mergeMultisigUnlock)
bind("#multisigUnlockSubmit", () => submitWorkbench(multisigUnlock))

document.querySelectorAll<HTMLButtonElement>("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", () => run(async () => {
    await copyArtifact(button.dataset.copyTarget!)
    log(`Copiado: ${button.dataset.copyTarget}`)
  }))
})

async function connectWallet() {
  const walletName = walletNameInput.value
  const wallet = window.cardano?.[walletName]
  if (!wallet) throw new Error(`Wallet ${walletName} não encontrada no navegador`)

  log(`Pedindo acesso à ${walletName}...`)
  const api = await wallet.enable()
  walletClient = Client.make(preprod).withCip30(api)
  userAddress = Address.toBech32(await walletClient.address())
  addressOutput.textContent = userAddress
  log(`Wallet conectada: ${userAddress}`)
}

async function buildPayment() {
  payment.setBuild(await buildTx("/api/workshop/01-payment", {
    userAddress: requireUserAddress(),
    recipientAddress: inputValue("#paymentRecipient"),
    lovelace: inputValue("#paymentLovelace"),
  }))
  log("Pagamento simples construído. Unsigned tx disponível na página.")
}

async function buildMetadata() {
  metadata.setBuild(await buildTx("/api/workshop/02-metadata", {
    userAddress: requireUserAddress(),
    recipientAddress: inputValue("#metadataRecipient"),
    lovelace: inputValue("#metadataLovelace"),
    message: inputValue("#metadataMessage"),
  }))
  log("Tx com metadata construída. Compare os details com o pagamento simples.")
}

async function buildMint() {
  mint.setBuild(await buildTx("/api/workshop/03-mint-cip25", {
    userAddress: requireUserAddress(),
    recipientAddress: inputValue("#mintRecipient"),
    tokenName: inputValue("#mintTokenName"),
    amount: inputValue("#mintAmount"),
    metadataName: inputValue("#mintMetadataName"),
    image: inputValue("#mintImage"),
    description: inputValue("#mintDescription"),
  }))
  log("Mint CIP-25 construído. Policy, asset e metadata estão visíveis nos details.")
}

async function describeMultisig() {
  const details = await postJson<Record<string, unknown>>("/api/workshop/04-multisig/describe", multisigPayload())
  select<HTMLTextAreaElement>("#multisigDetails").value = renderJson(details)
  log("Native script 2-de-2 gerado. Copie script address ou signers conforme necessário.")
}

async function listMultisigUtxos() {
  const result = await postJson<ScriptUtxosResponse>("/api/workshop/04-multisig/utxos", multisigPayload())
  select<HTMLTextAreaElement>("#multisigUtxos").value = renderJson(result)

  if (result.scriptUtxos.length === 1) {
    select<HTMLInputElement>("#multisigScriptUtxo").value = result.scriptUtxos[0].outRef
    log(`Script UTxO único selecionado: ${result.scriptUtxos[0].outRef}`)
    return
  }

  log(`Script UTxOs listados: ${result.scriptUtxos.length}. Copie o outRef escolhido para o campo de unlock.`)
}

async function buildMultisigLock() {
  multisigLock.setBuild(await buildTx("/api/workshop/04-multisig/lock", {
    ...multisigPayload(),
    lovelace: inputValue("#multisigLockLovelace"),
  }))
  log("Lock tx construída. Assine e submeta para criar UTxO no script address.")
}

async function buildMultisigUnlock() {
  multisigUnlock.setBuild(await buildTx("/api/workshop/04-multisig/unlock", {
    ...multisigPayload(),
    destinationAddress: inputValue("#multisigDestination"),
    lovelace: inputValue("#multisigUnlockLovelace"),
    scriptUtxo: inputValue("#multisigScriptUtxo"),
  }))
  log("Unlock tx construída. Agora colete witness A e witness B antes de submeter.")
}

async function signWorkbench(workbench: TxWorkbench) {
  const witnessSet = await requireWallet().signTx(workbench.unsigned.value.trim())
  workbench.witness.value = TransactionWitnessSet.toCBORHex(witnessSet)
  log(`${workbench.name}: witness set criado pela wallet conectada.`)
}

async function signMultisigUnlock() {
  const witnessSet = await requireWallet().signTx(multisigUnlock.unsigned.value.trim())
  multisigUnlock.witnessA.value = TransactionWitnessSet.toCBORHex(witnessSet)
  log("Multisig unlock: witness da wallet atual criado. Copie para o outro signer ou cole o witness recebido.")
}

async function submitWorkbench(workbench: SubmitWorkbench) {
  const { txHash } = await postJson<SubmitTxResponse>("/api/submit-tx", { signedTxCbor: workbench.signed.value.trim() })
  workbench.txHash.value = txHash
  log(`${workbench.name}: submetido. Tx hash: ${txHash}`)
}

function mergeWorkbench(workbench: TxWorkbench) {
  workbench.signed.value = mergeWitnesses(workbench.unsigned.value, [workbench.witness.value])
  log(`${workbench.name}: witness anexado. Signed tx CBOR disponível.`)
}

function mergeMultisigUnlock() {
  multisigUnlock.signed.value = mergeWitnesses(multisigUnlock.unsigned.value, [
    multisigUnlock.witnessA.value,
    multisigUnlock.witnessB.value,
  ])
  log("Multisig unlock: witnesses anexados. Signed tx CBOR disponível.")
}

async function buildTx(url: string, body: Record<string, string>): Promise<TxBuildResponse> {
  return postJson<TxBuildResponse>(url, body)
}

function multisigPayload() {
  return {
    userAddress: requireUserAddress(),
    secondSignerAddress: inputValue("#multisigSecondSigner"),
  }
}

function bind(selector: string, action: () => Promise<void> | void) {
  select(selector).addEventListener("click", () => run(async () => { await action() }))
}

async function run(action: () => Promise<void>) {
  try {
    await action()
  } catch (error) {
    log(error instanceof Error ? `Erro: ${error.message}` : `Erro: ${String(error)}`)
  }
}

function requireWallet(): BrowserWalletClient {
  if (!walletClient) throw new Error("Conecte a wallet primeiro")
  return walletClient
}

function requireUserAddress(): string {
  if (!userAddress) throw new Error("Conecte a wallet primeiro")
  return userAddress
}

function log(message: string) {
  logOutput.textContent += `${new Date().toLocaleTimeString()}  ${message}\n`
}

type SubmitTxResponse = {
  txHash: string
}

type ScriptUtxosResponse = {
  scriptAddress: string
  scriptUtxos: ReadonlyArray<{ outRef: string }>
}

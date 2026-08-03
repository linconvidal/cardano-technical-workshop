export const paymentReview = (details: Record<string, unknown> | undefined): string => {
  if (!details) return "Construa e assine a transação para ver o resumo."
  const recipient = text(details.recipientAddress)
  return `${network(details)}. O CBOR contém output de ${lovelaceAt(details, recipient)} lovelace para ${short(recipient)}. Taxa calculada no corpo: ${fee(details)} lovelace. Confira também inputs e troco na confirmação da wallet.`
}

export const metadataReview = (details: Record<string, unknown> | undefined): string => {
  if (!details) return "Construa e assine a transação para ver o resumo."
  const recipient = text(details.recipientAddress)
  const metadata = record(record(details.transaction)?.auxiliaryData)
  const message = text(record(metadata?.["674"])?.msg)
  return `${network(details)}. O CBOR contém output de ${lovelaceAt(details, recipient)} lovelace para ${short(recipient)} e mensagem pública no label 674: “${message}”. Taxa calculada no corpo: ${fee(details)} lovelace.`
}

export const mintReview = (details: Record<string, unknown> | undefined): string => {
  if (!details) return "Construa e assine o mint para ver o resumo."
  const expiresAt = Number(text(record(details.transaction)?.ttlUnixMs))
  const expiry = Number.isFinite(expiresAt) ? new Date(expiresAt).toLocaleString("pt-BR") : "não disponível"
  const policyId = text(details.policyId)
  const assetNameHex = text(details.assetNameHex)
  const recipient = text(details.recipientAddress)
  return `${network(details)}. O CBOR contém mint de ${mintAmount(details, policyId, assetNameHex)} unidade(s) de ${text(details.tokenName)} e output de ${assetAmountAt(details, recipient, policyId, assetNameHex)} para ${short(recipient)}. Policy ${short(policyId)}. Validade até ${expiry}. Taxa calculada no corpo: ${fee(details)} lovelace.`
}

export const eacMintReview = (details: Record<string, unknown> | undefined): string => {
  if (!details) return "Construa e assine a emissão EAC para ver o resumo."
  const transaction = record(details.transaction)
  const expiresAt = Number(text(transaction?.ttlUnixMs))
  const expiry = Number.isFinite(expiresAt) ? new Date(expiresAt).toLocaleString("pt-BR") : "não disponível"
  const policyId = text(details.policyId)
  const assetNameHex = text(details.assetNameHex)
  const recipient = text(details.recipientAddress)
  const quantity = mintAmount(details, policyId, assetNameHex)
  const metadata = record(record(transaction?.auxiliaryData)?.["65536"])
  return `${network(details)}. O CBOR contém emissão de ${quantity} unidades (${formatEac(quantity)}) de ${text(details.tokenName)} e output de ${assetAmountAt(details, recipient, policyId, assetNameHex)} para o endereço contábil ${short(recipient)}. Metadata raw no label 65536: version ${text(metadata?.version)}, unit ${text(metadata?.unit)}, decimals ${text(metadata?.decimals)} e três referências de evidência. A policy verifica somente a chave autorizada; não valida a metadata nem limita a oferta. Validade desta transação até ${expiry}. Taxa calculada no corpo: ${fee(details)} lovelace.`
}

export const eacRetireReview = (details: Record<string, unknown> | undefined): string => {
  if (!details) return "Construa e assine a aposentadoria EAC para ver o resumo."
  const transaction = record(details.transaction)
  const expiresAt = Number(text(transaction?.ttlUnixMs))
  const expiry = Number.isFinite(expiresAt) ? new Date(expiresAt).toLocaleString("pt-BR") : "não disponível"
  const policyId = text(details.policyId)
  const assetNameHex = text(details.assetNameHex)
  const recipient = text(details.recipientAddress)
  const quantity = mintAmount(details, policyId, assetNameHex)
  const remaining = assetAmountAt(details, recipient, policyId, assetNameHex)
  const metadata = record(record(transaction?.auxiliaryData)?.["65536"])
  return `${network(details)}. O CBOR contém burn de ${quantity} unidades (${formatEac(quantity.replace("-", ""))}) de ${text(details.tokenName)} e devolve saldo de ${remaining} unidades (${formatEac(remaining)}) à wallet contábil ${short(recipient)}. Metadata no label 65536: version ${text(metadata?.version)}, declaration_hash e delivery_reference_hash. A policy verifica somente a chave autorizada; não prova a entrega nem a declaração. Validade desta transação até ${expiry}. Taxa calculada no corpo: ${fee(details)} lovelace.`
}

export const multisigLockReview = (details: Record<string, unknown> | undefined): string => {
  if (!details) return "Construa e assine o lock para ver o resumo."
  const scriptAddress = text(details.scriptAddress)
  return `${network(details)}. O CBOR contém lock de ${lovelaceAt(details, scriptAddress)} lovelace no script ${short(scriptAddress)}. As duas chaves listadas em requiredSigners serão necessárias para desbloquear. Taxa calculada no corpo: ${fee(details)} lovelace.`
}

export const multisigUnlockReview = (details: Record<string, unknown> | undefined): string => {
  if (!details) return "Construa, colete e anexe os witnesses para ver o resumo."
  const destination = text(details.destinationAddress)
  const scriptAddress = text(details.scriptAddress)
  const signers = Array.isArray(details.requiredSigners)
    ? details.requiredSigners.map((signer) => short(text(signer))).join(" + ")
    : "não disponíveis"
  return `${network(details)}. O CBOR referencia o input ${short(text(details.selectedScriptUtxo))}, que será confirmado no script antes da assinatura; envia ${lovelaceAt(details, destination)} lovelace para ${short(destination)} e devolve ${lovelaceAt(details, scriptAddress)} lovelace ao script. Required signers: ${signers}. Taxa calculada no corpo: ${fee(details)} lovelace.`
}

const network = (details: Record<string, unknown>): string => {
  const value = text(record(details.transaction)?.network ?? details.network)
  return value === "testnet" ? "Testnet" : value
}

const mintAmount = (
  details: Record<string, unknown>,
  policyId: string,
  assetNameHex: string,
): string => {
  const mint = record(record(details.transaction)?.mint)
  return text(record(record(mint?.map)?.[policyId])?.[assetNameHex])
}

const assetAmountAt = (
  details: Record<string, unknown>,
  address: string,
  policyId: string,
  assetNameHex: string,
): string => {
  const output = outputAt(details, address)
  const multiAsset = record(record(output?.assets)?.multiAsset)
  return text(record(record(multiAsset?.map)?.[policyId])?.[assetNameHex])
}

const outputAt = (details: Record<string, unknown>, address: string): Record<string, unknown> | undefined => {
  const transaction = record(details.transaction)
  const outputs = Array.isArray(transaction?.outputs) ? transaction.outputs : []
  return outputs.map(record).find((candidate) => candidate?.address === address)
}

const lovelaceAt = (details: Record<string, unknown>, address: string): string => {
  const output = outputAt(details, address)
  return output ? text(output.lovelace) : "não localizado"
}

const fee = (details: Record<string, unknown>): string => {
  const transaction = record(details.transaction)
  return transaction ? text(transaction.feeLovelace) : "não disponível"
}

const formatEac = (raw: string): string => {
  try {
    const quantity = BigInt(raw)
    const whole = quantity / 1_000n
    const fraction = (quantity % 1_000n).toString().padStart(3, "0")
    return `${whole.toLocaleString("pt-BR")},${fraction} EAC`
  } catch {
    return "quantidade indisponível"
  }
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined

const text = (value: unknown): string => value === undefined || value === null ? "não disponível" : String(value)

const short = (value: string): string => value.length > 30 ? `${value.slice(0, 14)}...${value.slice(-10)}` : value

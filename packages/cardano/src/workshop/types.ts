export type TxBuildResult = {
  txCbor: string
  details: Record<string, unknown>
}

export type PaymentBuildParams = {
  userAddress: string
  recipientAddress: string
  lovelace: bigint
}

export type MetadataBuildParams = PaymentBuildParams & {
  message: string
}

export type MintBuildParams = {
  userAddress: string
  recipientAddress: string
  tokenName: string
  amount: bigint
  metadataName: string
  image: string
  description: string
}

export type EacIssuanceMetadata = {
  version: 1
  unit: "EAC"
  decimals: 3
  methodology_hash: string
  assurance_hash: string
  evidence_root: string
}

export type EacMintBuildParams = {
  userAddress: string
  recipientAddress: string
  metadata: EacIssuanceMetadata
}

export type EacRetirementMetadata = {
  version: 1
  declaration_hash: string
  delivery_reference_hash: string
}

export type EacRetireBuildParams = {
  userAddress: string
  metadata: EacRetirementMetadata
}

export type MultisigParams = {
  userAddress: string
  secondSignerAddress: string
}

export type MultisigDetails = {
  firstSignerAddress: string
  secondSignerAddress: string
  scriptAddress: string
  scriptHash: string
  nativeScriptCbor: string
  nativeScriptJson: string
  requiredSigners: ReadonlyArray<string>
}

export type MultisigLockParams = MultisigParams & {
  lovelace: bigint
}

export type MultisigUnlockParams = MultisigLockParams & {
  destinationAddress: string
  scriptUtxo?: string
}

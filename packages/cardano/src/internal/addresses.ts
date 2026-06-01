import { KeyHash, ScriptHash } from "@evolution-sdk/evolution"

export const expectKeyHash = (credential: KeyHash.KeyHash | ScriptHash.ScriptHash, label: string): KeyHash.KeyHash => {
  if (credential._tag === "KeyHash") return credential
  throw new Error(`${label} must be a key hash, got ${credential._tag}`)
}

export const credentialToHex = (credential: KeyHash.KeyHash | ScriptHash.ScriptHash) =>
  credential._tag === "KeyHash" ? KeyHash.toHex(credential) : ScriptHash.toHex(credential)

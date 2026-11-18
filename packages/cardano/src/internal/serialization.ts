import { AssetName } from "@evolution-sdk/evolution"

const textEncoder = new TextEncoder()

export const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

export const textToAssetNameBytes = (value: string): Uint8Array =>
  AssetName.toBytes(AssetName.fromBytes(textEncoder.encode(value)))

import { AssetName } from "@evolution-sdk/evolution"

const textEncoder = new TextEncoder()

export const bytesToHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")

export const textToAssetNameBytes = (value: string): Uint8Array =>
  AssetName.toBytes(AssetName.fromBytes(textEncoder.encode(value)))

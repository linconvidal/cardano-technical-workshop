export type Cip30WalletApi = {
  getNetworkId(): Promise<number>
  getUsedAddresses(): Promise<ReadonlyArray<string>>
  getUnusedAddresses(): Promise<ReadonlyArray<string>>
  getRewardAddresses(): Promise<ReadonlyArray<string>>
  getUtxos(): Promise<ReadonlyArray<string>>
  signTx(txCborHex: string, partialSign: boolean): Promise<string>
  signData(addressHex: string, payload: string | Uint8Array): Promise<{ payload: string | Uint8Array; signature: string }>
  submitTx(txCborHex: string): Promise<string>
}

declare global {
  interface Window {
    cardano?: Record<
      string,
      {
        name?: string
        icon?: string
        enable(): Promise<Cip30WalletApi>
      }
    >
  }
}

export {}

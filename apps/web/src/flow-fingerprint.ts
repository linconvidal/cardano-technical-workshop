export const snapshotInputs = (values: Record<string, string>): string => {
  const ordered = Object.entries(values).sort(([left], [right]) => left.localeCompare(right))
  return fingerprint(JSON.stringify(ordered))
}

export const fingerprint = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

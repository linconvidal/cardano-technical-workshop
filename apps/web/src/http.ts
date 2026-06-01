export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const responseText = await response.text()
  const payload = parseJsonResponse(responseText)

  if (!response.ok) {
    const message = payload && typeof payload.error === "string" ? payload.error : responseText
    throw new Error(`HTTP ${response.status}: ${stripHtml(message)}`)
  }

  if (!payload) throw new Error(`Expected JSON response from ${url}`)
  return payload as T
}

const parseJsonResponse = (responseText: string): { error?: unknown } | undefined => {
  if (!responseText.trim()) return undefined

  try {
    return JSON.parse(responseText) as { error?: unknown }
  } catch {
    return undefined
  }
}

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()

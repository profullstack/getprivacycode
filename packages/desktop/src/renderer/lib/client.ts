const api = window.privacycode

export async function fetchJSON<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await api.fetchApi(method, path, body)
  if (!response.ok) {
    const data = response.data as Record<string, unknown> | undefined
    const msg = typeof data?.message === "string" ? data.message : `HTTP ${response.status}`
    throw new Error(msg)
  }
  return (response.data as { data?: T })?.data ?? (response.data as T)
}

export function streamEvent(
  method: string,
  path: string,
  body: unknown,
  onEvent: (event: { event?: string; data?: string }) => void,
): Promise<void> {
  let buffer = ""
  let currentEvent = ""
  let currentData = ""

  return api.streamApi(method, path, body, (chunk: string) => {
    buffer += chunk
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""
    for (const line of lines) {
      if (line.startsWith("event: ")) currentEvent = line.slice(7).trim()
      else if (line.startsWith("data: ")) currentData = line.slice(6)
      else if (line === "") {
        if (currentData) onEvent({ event: currentEvent || undefined, data: currentData })
        currentEvent = ""
        currentData = ""
      }
    }
  })
}

export async function subscribeToNewsletter(email: string) {
  return api.subscribe(email)
}

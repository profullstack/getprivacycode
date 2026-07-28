export interface PrivacyCodeAPI {
  getServerUrl: () => Promise<string>
  fetchApi: (method: string, path: string, body?: unknown) => Promise<ApiResponse>
  streamApi: (method: string, path: string, body: unknown, onChunk: (text: string) => void) => Promise<void>
  setTitle: (title: string) => Promise<void>
  subscribe: (email: string) => Promise<{ success: boolean }>
}

export interface ApiResponse {
  ok: boolean
  status: number
  data?: unknown
}

export interface SessionData {
  id: string
  title: string
  time: { updated: number }
}

export interface MessageData {
  id: string
  sessionID: string
  role: "user" | "assistant"
  content?: string
  parts?: Array<{ type: string; text?: string; content?: string }>
  time?: { created: number }
  parentID?: string
}

import { contextBridge, ipcRenderer } from "electron"

type StreamCallback = (text: string) => void
const streamCallbacks = new Map<string, StreamCallback>()

ipcRenderer.on("stream-chunk", (_event, { streamId, text }: { streamId: string; text: string }) => {
  streamCallbacks.get(streamId)?.(text)
})
ipcRenderer.on("stream-end", (_event, streamId: string) => {
  streamCallbacks.delete(streamId)
})

contextBridge.exposeInMainWorld("privacycode", {
  getServerUrl: () => ipcRenderer.invoke("get-server-url"),

  fetchApi: (method: string, path: string, body?: unknown) =>
    ipcRenderer.invoke("fetch-api", { method, path, body }),

  streamApi: (method: string, path: string, body: unknown, onChunk: StreamCallback) => {
    const streamId = Math.random().toString(36).slice(2)
    streamCallbacks.set(streamId, onChunk)
    return ipcRenderer.invoke("stream-api", { method, path, body })
  },

  setTitle: (title: string) => ipcRenderer.invoke("set-title", title),

  subscribe: (email: string) => ipcRenderer.invoke("user:subscribe", email),
})

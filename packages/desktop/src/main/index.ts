import { app, BrowserWindow, ipcMain, shell } from "electron"
import { spawn, ChildProcess } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DATA_DIR = path.join(app.getPath("userData"), "privacycode-data")
const STORE_PATH = path.join(DATA_DIR, "store.json")

interface Store {
  subscribers: string[]
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function loadStore(): Store {
  ensureDataDir()
  try { return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) }
  catch { return { subscribers: [] } }
}

function saveStore(store: Store) {
  ensureDataDir()
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2))
}

let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null
let serverUrl = ""

const isDev = !app.isPackaged
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(__dirname, "../../dist/renderer")

function startServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const port = 4096
    const proc = spawn("privacycode", ["serve", `--hostname=127.0.0.1`, `--port=${port}`], {
      env: { ...process.env, PRIVACYCODE_CONFIG_CONTENT: "{}" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    serverProcess = proc
    const timeout = setTimeout(() => { cleanupServer(); reject(new Error("Server startup timed out")) }, 15000)
    let output = ""
    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      for (const line of output.split("\n")) {
        if (line.includes("server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (match) { clearTimeout(timeout); resolve(match[1]!); return }
        }
      }
    })
    proc.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString() })
    proc.on("exit", (code) => { clearTimeout(timeout); reject(new Error(`Server exited with code ${code}: ${output}`)) })
    proc.on("error", (err) => { clearTimeout(timeout); reject(err) })
  })
}

function cleanupServer() {
  if (serverProcess) { serverProcess.kill(); serverProcess = null }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600,
    title: "PrivacyCode", backgroundColor: "#0d0d0d", titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  })
  mainWindow.on("closed", () => { mainWindow = null })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: "deny" }
  })
  if (isDev && VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, "index.html"))
  }
}

// ── IPC ──
ipcMain.handle("get-server-url", () => serverUrl)
ipcMain.handle("set-title", (_event, title: string) => { if (mainWindow) mainWindow.setTitle(title) })

ipcMain.handle("fetch-api", async (_event, request: { method: string; path: string; body?: unknown }) => {
  if (!serverUrl) return { ok: false, status: 0, data: { message: "Server is not running. Run 'privacycode serve' in your terminal." } }
  const url = `${serverUrl}${request.path}`
  console.log(`[PrivacyCode] ${request.method} ${url}`)
  try {
    const opts: RequestInit = { method: request.method, headers: { "Content-Type": "application/json" } }
    if (request.body && request.method !== "GET") opts.body = JSON.stringify(request.body)
    const resp = await fetch(url, opts)
    const ct = resp.headers.get("content-type") || ""
    if (ct.includes("application/json")) return { ok: resp.ok, status: resp.status, data: await resp.json() }
    return { ok: resp.ok, status: resp.status, data: await resp.text() }
  } catch (err) {
    console.error(`[PrivacyCode] fetch failed:`, err)
    return { ok: false, status: 0, data: { message: `Cannot reach server at ${url}` } }
  }
})

ipcMain.handle("stream-api", async (event, request: { method: string; path: string; body?: unknown }) => {
  const url = `${serverUrl}${request.path}`
  const opts: RequestInit = { method: request.method, headers: { "Content-Type": "application/json" } }
  if (request.body && request.method !== "GET") opts.body = JSON.stringify(request.body)
  const resp = await fetch(url, opts)
  if (!resp.ok || !resp.body) return
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  const sender = event.sender
  const streamId = Math.random().toString(36).slice(2)
  sender.send("stream-start", streamId)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      sender.send("stream-chunk", { streamId, text: decoder.decode(value, { stream: true }) })
    }
  } finally {
    reader.releaseLock()
    sender.send("stream-end", streamId)
  }
})

ipcMain.handle("user:subscribe", (_event, email: string) => {
  const store = loadStore()
  if (!store.subscribers.includes(email)) {
    store.subscribers.push(email)
    saveStore(store)
    console.log(`[PrivacyCode] New subscriber: ${email}`)
  }
  return { success: true }
})

// ── Lifecycle ──
app.whenReady().then(async () => {
  try { serverUrl = await startServer() } catch (err) { console.error("Failed to start server:", err) }
  createWindow()
})

app.on("window-all-closed", () => { cleanupServer(); app.quit() })
app.on("before-quit", () => { cleanupServer() })

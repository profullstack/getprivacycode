import { createResource, createSignal, Show } from "solid-js"
import Sidebar from "./components/sidebar"
import ChatView from "./components/chat-view"
import EmailGate from "./components/auth-screen"
import { fetchJSON } from "./lib/client"
import type { SessionData } from "./lib/types"

export default function App() {
  const [subscribed, setSubscribed] = createSignal(false)
  const [error, setError] = createSignal("")
  const [sessions, { refetch }] = createResource(
    () => subscribed(),
    async (ready) => {
      if (!ready) return []
      try {
        const data = await fetchJSON<SessionData[]>("GET", "/api/session")
        return (data || []).sort((a, b) => b.time.updated - a.time.updated)
      } catch {
        return []
      }
    },
  )

  const [activeId, setActiveId] = createSignal<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = createSignal(true)

  const newChat = async () => {
    setError("")
    try {
      const data = await fetchJSON<SessionData>("POST", "/api/session", {})
      setActiveId(data.id)
      refetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create session"
      if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED") || msg.includes("Not Found")) {
        setError("PrivacyCode server is not running. Run 'privacycode serve' in a terminal first, then restart the app.")
      } else {
        setError(msg)
      }
    }
  }

  const delSession = async (id: string) => {
    try {
      await fetchJSON("DELETE", `/api/session/${id}`)
      if (activeId() === id) setActiveId(null)
      refetch()
    } catch {}
  }

  const renameSession = async (id: string, title: string) => {
    try { await fetchJSON("PATCH", `/api/session/${id}`, { title }); refetch() } catch {}
  }

  return (
    <div style="display:flex;height:100%;width:100%;">
      <Show when={!subscribed()}>
        <EmailGate onDone={() => setSubscribed(true)} />
      </Show>

      <Show when={subscribed()}>
        <Show when={sidebarOpen()}>
          <Sidebar
            sessions={sessions() || []}
            activeId={activeId()}
            onNewChat={newChat}
            onSelectSession={setActiveId}
            onDeleteSession={delSession}
            onRenameSession={renameSession}
            onClose={() => setSidebarOpen(false)}
          />
        </Show>
        <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
          <Show when={activeId()} fallback={
            <Welcome
              error={error()}
              onNewChat={newChat}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              sidebarOpen={sidebarOpen()}
              onDismissError={() => setError("")}
            />
          }>
            <ChatView
              sessionId={activeId()!}
              onSessionUpdated={() => refetch()}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
            />
          </Show>
        </div>
      </Show>
    </div>
  )
}

function Welcome(props: {
  error: string
  onNewChat: () => void
  onToggleSidebar: () => void
  sidebarOpen: boolean
  onDismissError: () => void
}) {
  return (
    <div class="welcome">
      <div class="welcome-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-text)" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
        </svg>
      </div>
      <h1 class="welcome-title">PrivacyCode</h1>
      <p class="welcome-subtitle">
        Your privacy-first AI coding companion. PII and secrets are tokenized locally —
        no AI provider ever sees your real data.
      </p>

      <Show when={props.error}>
        <div class="card" style="margin-bottom:20px;text-align:left;border-color:rgba(239,68,68,0.2);background:var(--color-error-bg);max-width:500px;width:100%;display:flex;align-items:flex-start;gap:12px;">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--color-error-text)" stroke-width="1.5" style="flex-shrink:0;margin-top:1px;"><path d="M10 7.5V11.25M10 13.75V13.76M10 2.5L1.88 16.25h16.24L10 2.5Z" stroke-linecap="square"/></svg>
          <div style="flex:1;min-width:0;">
            <p style="font-size:var(--text-xs);color:var(--color-error-text);line-height:1.6;">{props.error}</p>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" onClick={props.onDismissError}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="square"/></svg>
          </button>
        </div>
      </Show>

      <div class="suggestions-grid">
        <button class="suggestion-chip" onClick={props.onNewChat}>
          <span class="suggestion-icon"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7.92 17.92H16.25M16.25 5.83L12.5 2.08L2.08 14.17V17.92H5.83L16.25 5.83Z" stroke-linecap="square"/></svg></span>
          Review a pull request
        </button>
        <button class="suggestion-chip" onClick={props.onNewChat}>
          <span class="suggestion-icon"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 7.5V12.5M10 15V15.01M10 2.5L1.875 16.25H18.125L10 2.5Z" stroke-linecap="square"/></svg></span>
          Debug an error
        </button>
        <button class="suggestion-chip" onClick={props.onNewChat}>
          <span class="suggestion-icon"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17.5 10C12.29 10 10 12.29 10 17.5C10 12.29 7.71 10 2.5 10C7.71 10 10 7.71 10 2.5C10 7.71 12.29 10 17.5 10Z" stroke-linecap="square"/></svg></span>
          Add a new feature
        </button>
        <button class="suggestion-chip" onClick={props.onNewChat}>
          <span class="suggestion-icon"><svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3.75 5.42L8.33 10L3.75 14.58M10.42 14.58H16.25" stroke-linecap="square"/></svg></span>
          Explain this codebase
        </button>
      </div>

      <button class="btn btn-primary btn-lg" onClick={props.onNewChat} style="padding:0 28px;">
        Start a conversation
      </button>
    </div>
  )
}

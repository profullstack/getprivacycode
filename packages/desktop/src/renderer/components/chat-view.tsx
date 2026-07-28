import { createEffect, createResource, createSignal, For, Show } from "solid-js"
import { fetchJSON } from "../lib/client"
import type { MessageData } from "../lib/types"
import MessageBubble from "./message-bubble"

export default function ChatView(props: {
  sessionId: string
  onSessionUpdated: () => void
  onToggleSidebar: () => void
}) {
  const [messages, { refetch: refetchMessages }] = createResource(
    () => props.sessionId,
    async (id) => {
      const data = await fetchJSON<MessageData[]>("GET", `/api/session/${id}/message`)
      console.log("[ChatView] messages:", data?.length || 0, "messages")
      return data || []
    },
  )

  const [input, setInput] = createSignal("")
  const [sending, setSending] = createSignal(false)
  const [streamingContent, setStreamingContent] = createSignal("")
  const [streamingMsgId, setStreamingMsgId] = createSignal<string | null>(null)
  let endRef: HTMLDivElement | undefined
  let textareaRef: HTMLTextAreaElement | undefined

  function scrollDown() {
    requestAnimationFrame(() => endRef?.scrollIntoView({ behavior: "smooth" }))
  }

  createEffect(() => { messages(); streamingContent(); scrollDown() })

  const handleSend = async () => {
    const text = input().trim()
    if (!text || sending()) return
    setInput("")
    setSending(true)
    setStreamingContent("")
    if (textareaRef) textareaRef.style.height = "auto"

    try {
      setStreamingMsgId(`stream-${Date.now()}`)
      const data = await fetchJSON<{
        info: { id: string }
        parts: Array<{ type: string; text?: string }>
      }>("POST", `/session/${props.sessionId}/message`, {
        parts: [{ type: "text", text }],
      })

      const responseText = data.parts
        .filter((p) => p.type === "text" || p.type === "reasoning")
        .map((p) => p.text || "")
        .join("\n")

      console.log("[ChatView] response:", responseText.slice(0, 100))
      setStreamingContent(responseText || "(empty response)")
      refetchMessages()
      props.onSessionUpdated()
      setTimeout(() => {
        setStreamingContent("")
        setStreamingMsgId(null)
      }, 500)
    } catch (err) {
      console.error(err)
      setStreamingContent("Error: " + (err instanceof Error ? err.message : "Failed to send message"))
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const hasContent = () => (messages() || []).length > 0 || streamingContent()

  return (
    <div class="chat-container">
      {/* Header */}
      <div class="chat-header drag-region">
        <div class="no-drag" style="display:flex;align-items:center;gap:12px;">
          <button class="btn btn-ghost btn-icon btn-sm" onClick={props.onToggleSidebar} title="Toggle sidebar">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.92 2.92H7.92M2.92 2.92V17.08M7.92 17.08L2.92 17.08M7.92 17.08V2.92M2.92 10H17.08M17.08 2.92V17.08M17.08 10H12.08" stroke-linecap="square"/></svg>
          </button>
          <span style="font-size:var(--text-sm);color:var(--color-text-secondary);font-weight:var(--font-medium);">
            {props.sessionId.slice(0, 8)}
          </span>
        </div>
        <div class="badge badge-accent no-drag" style="gap:6px;">
          <span class="dot dot-success" />
          Protected
        </div>
      </div>

      {/* Messages */}
      <div class="chat-messages">
        <Show when={hasContent()} fallback={
          <div class="welcome" style="padding-top:80px;">
            <div class="welcome-icon">
              <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="var(--color-accent-text)" stroke-width="1.5"><path d="M17.5 10C12.29 10 10 12.29 10 17.5C10 12.29 7.71 10 2.5 10C7.71 10 10 7.71 10 2.5C10 7.71 12.29 10 17.5 10Z" stroke-linecap="square"/></svg>
            </div>
            <p style="font-size:var(--text-sm);color:var(--color-text-tertiary);">Ask anything to get started</p>
          </div>
        }>
          <div style="max-width:740px;margin:0 auto;">
            <For each={messages() || []}>
              {(msg) => <MessageBubble message={msg} />}
            </For>
            <Show when={streamingContent()}>
              <MessageBubble message={{
                id: streamingMsgId() || "stream",
                sessionID: props.sessionId,
                role: "assistant",
                content: streamingContent(),
                time: { created: Date.now() },
              }} isStreaming />
            </Show>
            <Show when={sending() && !streamingContent()}>
              <div class="message-row assistant">
                <div class="message-inner">
                  <div class="avatar avatar-sm" style="background:var(--color-accent-bg);border:1px solid var(--color-accent-border);">
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--color-accent-text)" stroke-width="1.5"><path d="M17.5 10C12.29 10 10 12.29 10 17.5C10 12.29 7.71 10 2.5 10C7.71 10 10 7.71 10 2.5C10 7.71 12.29 10 17.5 10Z" stroke-linecap="square"/></svg>
                  </div>
                  <div class="loading-dots"><span /><span /><span /></div>
                </div>
              </div>
            </Show>
          </div>
        </Show>
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div class="chat-input-area">
        <div style="max-width:740px;margin:0 auto;">
          <div class="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              class="chat-input"
              value={input()}
              onInput={(e) => { setInput(e.currentTarget.value); const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px" }}
              onKeyDown={handleKeyDown}
              placeholder="Message PrivacyCode..."
              rows={1}
              disabled={sending()}
            />
            <button
              class="btn btn-icon"
              classList={{ "btn-primary": !!input().trim() && !sending(), "btn-secondary": !input().trim() || sending() }}
              onClick={handleSend}
              disabled={!input().trim() || sending()}
              style="flex-shrink:0;"
            >
              {sending()
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" class="animate-spin"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.75"/></svg>
                : <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 10L2.72 2.6A49.8 49.8 0 0117.9 10 49.8 49.8 0 012.72 17.39L5 10zm0 0h6.25"/></svg>
              }
            </button>
          </div>
          <p class="chat-input-disclaimer">
            PrivacyCode tokenizes PII and secrets before sending to AI providers. Your data stays private.
          </p>
        </div>
      </div>
    </div>
  )
}

import { createSignal, Show } from "solid-js"
import type { MessageData } from "../lib/types"
import { renderMarkdown, renderMarkdownStreaming } from "../lib/markdown"

function extractText(msg: MessageData): string {
  if (msg.content) return msg.content
  if (msg.parts) {
    return msg.parts
      .filter((p) => p.type === "text" || p.type === "reasoning")
      .map((p) => p.text || "")
      .join("\n")
  }
  return ""
}

function msgTimestamp(msg: MessageData): number {
  return msg.time?.created ?? Date.now()
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MessageBubble(props: { message: MessageData; isStreaming?: boolean }) {
  const [copied, setCopied] = createSignal(false)
  const isUser = props.message.role === "user"
  const text = () => extractText(props.message)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const html = () =>
    props.isStreaming
      ? renderMarkdownStreaming(text())
      : renderMarkdown(text())

  const empty = () => !text().trim()

  return (
    <div class="message-row" classList={{ user: isUser, assistant: !isUser }}>
      <div class="message-inner" classList={{ "user-inner": isUser }}>
        {!isUser ? (
          <div class="avatar avatar-sm" style="background:var(--color-accent-bg);border:1px solid var(--color-accent-border);margin-top:2px;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--color-accent-text)" stroke-width="1.5"><path d="M17.5 10C12.29 10 10 12.29 10 17.5C10 12.29 7.71 10 2.5 10C7.71 10 10 7.71 10 2.5C10 7.71 12.29 10 17.5 10Z" stroke-linecap="square"/></svg>
          </div>
        ) : (
          <div class="avatar avatar-sm" style="background:var(--color-bg-active);border:1px solid var(--color-border);margin-top:2px;">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--color-text-secondary)" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.12a17.93 17.93 0 0115 0A7.5 7.5 0 015.5 13.63a7.5 7.5 0 01-1 6.49z"/></svg>
          </div>
        )}
        <div style="flex:1;min-width:0;">
          <div class="message-bubble prose" classList={{ "user-bubble": isUser, "assistant-bubble": !isUser, "streaming-cursor": props.isStreaming && !empty() }}>
            <Show when={!empty()} fallback={<span style="font-size:var(--text-sm);color:var(--color-text-tertiary);font-style:italic;">Thinking...</span>}>
              <div innerHTML={html()} class="[&_.code-block]:my-3 [&_.code-block]:rounded-xl [&_.code-block]:bg-[#0a0a0a] [&_.code-block]:border [&_.code-block]:border-border-primary [&_.code-block]:overflow-hidden [&_.code-lang]:block [&_.code-lang]:px-4 [&_.code-lang]:py-1.5 [&_.code-lang]:text-xs [&_.code-lang]:text-text-tertiary [&_.code-lang]:bg-bg-tertiary [&_.code-lang]:border-b [&_.code-lang]:border-border-primary [&_.code-lang]:font-mono [&_pre]:!bg-transparent [&_pre]:p-4 [&_pre]:text-xs [&_pre]:leading-relaxed [&_pre]:overflow-x-auto [&_code]:text-xs [&_p]:leading-relaxed" />
            </Show>
          </div>
          <div class="message-meta" classList={{ "user-meta": isUser }}>
            <span class="message-time">{timeAgo(msgTimestamp(props.message))}</span>
            <button class="message-copy-btn" onClick={handleCopy} title="Copy">
              <Show when={copied()} fallback={
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.25 6.25V2.92H17.08V13.75H13.75M13.75 6.25V17.08H2.92V6.25H13.75Z" stroke-linecap="round"/></svg>
              }>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="var(--color-success)" stroke-width="2.5"><path d="M5 11.97L8.38 14.75L15 5.83" stroke-linecap="square"/></svg>
              </Show>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

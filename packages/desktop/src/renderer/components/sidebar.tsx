import { createSignal, For, Show } from "solid-js"
import type { SessionData } from "../lib/types"

function groupSessionsByDate(sessions: SessionData[]) {
  const now = Date.now()
  const day = 86_400_000
  const groups: { label: string; items: SessionData[] }[] = []
  const today: SessionData[] = []
  const yesterday: SessionData[] = []
  const thisWeek: SessionData[] = []
  const older: SessionData[] = []

  for (const s of sessions) {
    const diff = now - s.time.updated
    if (diff < day) today.push(s)
    else if (diff < 2 * day) yesterday.push(s)
    else if (diff < 7 * day) thisWeek.push(s)
    else older.push(s)
  }
  if (today.length) groups.push({ label: "Today", items: today })
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday })
  if (thisWeek.length) groups.push({ label: "This Week", items: thisWeek })
  if (older.length) groups.push({ label: "Older", items: older })
  return groups
}

export default function Sidebar(props: {
  sessions: SessionData[]
  activeId: string | null
  onNewChat: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = createSignal("")
  const [editingId, setEditingId] = createSignal<string | null>(null)
  const [editValue, setEditValue] = createSignal("")

  const filtered = () => {
    const q = search().toLowerCase()
    if (!q) return props.sessions
    return props.sessions.filter((s) => (s.title || "").toLowerCase().includes(q))
  }
  const groups = () => groupSessionsByDate(filtered())

  const startRename = (s: SessionData) => {
    setEditingId(s.id)
    setEditValue(s.title || "")
  }
  const submitRename = () => {
    const id = editingId()
    if (!id) return
    props.onRenameSession(id, editValue().trim() || "Untitled")
    setEditingId(null)
    setEditValue("")
  }

  return (
    <div class="sidebar drag-region">
      {/* Header */}
      <div class="sidebar-header no-drag" style="padding-left:78px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="avatar avatar-sm" style="background:var(--color-accent-bg);border:1px solid var(--color-accent-border);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-text)" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span style="font-size:var(--text-sm);font-weight:var(--font-semibold);color:var(--color-text);">PrivacyCode</span>
        </div>
        <button class="btn btn-ghost btn-icon btn-sm" onClick={props.onClose} title="Close sidebar">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.67 13.33L15 10l-3.33-3.33M5 13.33L8.33 10 5 6.67" stroke-linecap="square"/></svg>
        </button>
      </div>

      {/* New chat button */}
      <div style="padding:0 var(--space-3) var(--space-2);" class="no-drag">
        <button class="btn btn-secondary" style="width:100%;justify-content:flex-start;" onClick={props.onNewChat}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 4.5v11M4.5 10h11" stroke-linecap="square"/></svg>
          New conversation
        </button>
      </div>

      {/* Search */}
      <div style="padding:0 var(--space-3) var(--space-3);" class="no-drag">
        <div style="position:relative;">
          <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--color-text-tertiary);" width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l2.5 2.5" stroke-linecap="square"/></svg>
          <input
            class="input"
            style="padding-left:32px;height:32px;font-size:var(--text-xs);"
            type="text"
            placeholder="Search..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
      </div>

      {/* Sessions */}
      <div class="sidebar-body no-drag">
        <Show when={filtered().length > 0} fallback={
          <div style="text-align:center;padding:var(--space-12) var(--space-4);font-size:var(--text-xs);color:var(--color-text-tertiary);">
            {search() ? "No conversations match" : "No conversations yet"}
          </div>
        }>
          <For each={groups()}>
            {(group) => (
              <div style="margin-bottom:var(--space-1);">
                <div class="sidebar-section-title">{group.label}</div>
                <For each={group.items}>
                  {(session) => (
                    <div
                      class="sidebar-item"
                      classList={{ active: session.id === props.activeId }}
                      onClick={() => props.onSelectSession(session.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" style="flex-shrink:0;">
                        <path d="M7.19 13.25L6.5 15.63l-.68-2.37c-.33-1.14-1.02-2.05-2.06-2.37L1.44 10.2l2.37-.68c1.18-.33 2.09-1.16 2.38-2.37L7 4.8l.81 2.35c.36 1.04.96 1.82 2.07 2.22l2.62.83-2.62.83c-1.11.4-1.7 1.18-2.07 2.22L7 15.2l.19-1.95z" stroke-linecap="square"/>
                      </svg>
                      <Show when={editingId() === session.id} fallback={
                        <span class="truncate" style="flex:1;min-width:0;" onDblClick={() => startRename(session)}>
                          {session.title || "New conversation"}
                        </span>
                      }>
                        <input
                          type="text"
                          value={editValue()}
                          onInput={(e) => setEditValue(e.currentTarget.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") submitRename(); if (e.key === "Escape") setEditingId(null) }}
                          onBlur={submitRename}
                          style="flex:1;min-width:0;background:var(--color-bg-active);border:1px solid var(--color-accent-border);border-radius:var(--radius-md);padding:2px 6px;font-size:var(--text-xs);color:var(--color-text);outline:none;"
                          autofocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Show>
                      <div class="sidebar-item-actions">
                        <button class="sidebar-item-action" onClick={(e) => { e.stopPropagation(); startRename(session) }} title="Rename">
                          <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M7.92 17.92H16.25M16.25 5.83L12.5 2.08L2.08 14.17V17.92H5.83L16.25 5.83Z" stroke-linecap="square"/></svg>
                        </button>
                        <button class="sidebar-item-action destructive" onClick={(e) => { e.stopPropagation(); props.onDeleteSession(session.id) }} title="Delete">
                          <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.58 17.91H15.42L16.25 4.58H3.75L4.58 17.91Z" stroke-linecap="square"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </Show>
      </div>

      {/* Footer */}
      <div class="sidebar-footer no-drag">
        <div class="badge badge-success" style="width:100%;justify-content:center;padding:6px 10px;">
          <span class="dot dot-success animate-pulse-dot" />
          Privacy protection active
        </div>
      </div>
    </div>
  )
}

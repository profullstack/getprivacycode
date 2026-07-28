import { createSignal, Show } from "solid-js"
import { subscribeToNewsletter } from "../lib/client"

export default function EmailGate(props: { onDone: () => void }) {
  const [email, setEmail] = createSignal("")
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal("")

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    const em = email().trim()
    if (!em.includes("@") || !em.includes(".")) { setError("Please enter a valid email address"); return }
    setLoading(true)
    setError("")
    try {
      await subscribeToNewsletter(em)
      props.onDone()
    } catch {
      setError("Something went wrong. Try again.")
    } finally { setLoading(false) }
  }

  return (
    <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:40px;">
      <div style="width:100%;max-width:380px;text-align:center;">
        <div style="display:flex;justify-content:center;margin-bottom:32px;">
          <div style="display:flex;align-items:center;justify-content:center;width:56px;height:56px;background:var(--color-accent-bg);border:1px solid var(--color-accent-border);border-radius:16px;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-text)" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <h1 style="font-size:var(--text-3xl);font-weight:var(--font-semibold);margin-bottom:8px;color:var(--color-text);letter-spacing:-0.02em;">Welcome to PrivacyCode</h1>
          <p style="font-size:var(--text-sm);color:var(--color-text-secondary);margin-bottom:28px;line-height:1.6;">
            Subscribe to get product updates, privacy news, and early access to enterprise features.
          </p>
          <div style="margin-bottom:16px;">
            <input class="input" style="height:44px;font-size:var(--text-base);padding:0 16px;" type="email" placeholder="you@company.com" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} autofocus />
          </div>
          <Show when={error()}>
            <p style="font-size:var(--text-xs);color:var(--color-error-text);margin-bottom:16px;background:var(--color-error-bg);padding:8px 12px;border-radius:var(--radius-md);border:1px solid rgba(239,68,68,0.15);">{error()}</p>
          </Show>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button class="btn btn-primary btn-lg" style="width:100%;" type="submit" disabled={loading()}>
              {loading() ? "Subscribing..." : "Subscribe"}
            </button>
            <button type="button" class="btn btn-ghost btn-lg" style="width:100%;" onClick={props.onDone}>
              Skip for now
            </button>
          </div>
          <p style="font-size:var(--text-2xs);color:var(--color-text-tertiary);margin-top:16px;">
            No spam. Unsubscribe anytime.
          </p>
        </form>
      </div>
    </div>
  )
}

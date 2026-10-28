// Sealed storage for the CRM's Gmail app password.
//
// The CRM is a single-operator tool, so the app password is an operator secret. It is
// never stored in plaintext: the browser (or `bun cli.ts`) seals it under a passphrase
// with @profullstack/sealed-secrets, and the server only ever holds ciphertext plus the
// seal record. To send mail or poll IMAP the operator unlocks: the client derives the
// 32-byte data key and posts it (never the passphrase); the server keeps it in memory
// with a TTL (default 7d) and drops it on Lock, expiry or restart. While locked, the
// IMAP poll pauses with "locked: unlock to resume".
import type { Database } from "bun:sqlite"
import {
  UnlockStore,
  base64ToBytes,
  createSealer,
  isCipherBlob,
  isSealRecord,
  wipe,
} from "@profullstack/sealed-secrets"

export const OPERATOR = "operator"
export const OPERATOR_TTL_SECONDS = 7 * 24 * 3600
export const LOCKED_MESSAGE = "locked: unlock to resume"
export const sealer = createSealer({ app: "getprivacycode-crm", scope: "operator_mail" })

export type MailSecrets = { SMTP_PASS: string; IMAP_PASS: string }
export type ServerConfig = { host?: string; port?: number; secure?: boolean; user?: string; pass?: string }

// Keys under which the settings table holds mail state. PUT /api/settings may not write them.
export const PROTECTED_KEYS = new Set(["smtp_config", "imap_config", "email_config", "mail_seal", "mail_secrets"])

export function legacyMigrationEnabled(env: Record<string, string | undefined> = process.env) {
  return (env.LEGACY_KEY_MIGRATION ?? "on").toLowerCase() !== "off"
}

function readJson(db: Database, key: string): any {
  const row = db.query("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | null
  if (!row) return null
  try { return JSON.parse(row.value) } catch { return null }
}

function writeJson(db: Database, key: string, value: unknown) {
  db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value))
}

/** host/port/user only: the pass field is never returned. */
export function serverConfig(db: Database, key: "smtp_config" | "imap_config"): ServerConfig | null {
  const c = readJson(db, key)
  if (!c) return null
  const { pass: _drop, ...rest } = c
  return rest
}

export function getSeal(db: Database) {
  const s = readJson(db, "mail_seal")
  return isSealRecord(s) ? s : null
}

function getSealedBlob(db: Database) {
  const b = readJson(db, "mail_secrets")
  return isCipherBlob(b) ? b : null
}

/** True while a pre-seal row still holds a plaintext pass. */
export function hasLegacyPlaintext(db: Database) {
  return ["smtp_config", "imap_config"].some((k) => {
    const c = readJson(db, k)
    return !!c && typeof c.pass === "string" && c.pass.length > 0
  })
}

/** How many settings rows still carry a plaintext pass (for the cutoff report). */
export function countLegacyRows(db: Database) {
  return ["smtp_config", "imap_config"].filter((k) => {
    const c = readJson(db, k)
    return !!c && typeof c.pass === "string" && c.pass.length > 0
  }).length
}

/** One-shot migration read: the legacy plaintext, for the operator's browser to seal. */
export function readLegacyForMigration(db: Database, env = process.env): MailSecrets | null {
  if (!legacyMigrationEnabled(env)) return null
  const smtp = readJson(db, "smtp_config")
  const imap = readJson(db, "imap_config")
  const smtpPass = typeof smtp?.pass === "string" ? smtp.pass : ""
  const imapPass = typeof imap?.pass === "string" ? imap.pass : smtpPass
  if (!smtpPass && !imapPass) return null
  return { SMTP_PASS: smtpPass, IMAP_PASS: imapPass || smtpPass }
}

function stripPass(db: Database, key: "smtp_config" | "imap_config", fallback: ServerConfig) {
  const c = readJson(db, key) ?? fallback
  const { pass: _drop, ...rest } = c
  writeJson(db, key, { ...fallback, ...rest, user: fallback.user ?? rest.user })
}

/**
 * Stores the sealed mail secrets. The caller must prove it holds the data key for `seal`
 * (verifyDataKey) before calling. Strips every legacy plaintext pass in the same transaction.
 */
export function saveSealedConfig(db: Database, email: string, seal: unknown, secrets: unknown) {
  if (!isSealRecord(seal)) throw new Error("seal record required")
  if (!isCipherBlob(secrets)) throw new Error("sealed secrets required")
  const hadLegacy = hasLegacyPlaintext(db)
  db.transaction(() => {
    writeJson(db, "mail_seal", seal)
    writeJson(db, "mail_secrets", secrets)
    stripPass(db, "smtp_config", { host: "smtp.gmail.com", port: 587, secure: false, user: email })
    stripPass(db, "imap_config", { host: "imap.gmail.com", port: 993, secure: true, user: email })
    writeJson(db, "email_config", { email })
  })()
  if (hadLegacy) {
    // Scrub the old plaintext out of free pages and the WAL, not just the live rows.
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
    db.exec("VACUUM")
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  }
}

export function decodeDataKey(b64: unknown): Uint8Array {
  if (typeof b64 !== "string") throw new Error("data key required")
  const key = base64ToBytes(b64)
  if (key.length !== 32) throw new Error("data key must be 32 bytes")
  return key
}

/** In-memory operator unlock. Restart = locked. */
export class MailVault {
  readonly store = new UnlockStore()
  #lockedAnnounced = false

  constructor(private db: Database, private log: (msg: string) => void = (m) => console.warn(m)) {
    this.store.onChange((_user, unlocked) => {
      if (unlocked) this.#lockedAnnounced = false
      else this.announceLocked()
    })
  }

  /** One log line per lock, for the fleet alert path to pick up. */
  announceLocked() {
    if (this.#lockedAnnounced) return
    this.#lockedAnnounced = true
    this.log(`getprivacycode-crm: operator keys locked, unlock to resume`)
  }

  async unlock(dataKey: Uint8Array, ttlSeconds = OPERATOR_TTL_SECONDS) {
    const seal = getSeal(this.db)
    if (!seal) throw new Error("mail is not set up")
    try {
      if (!(await sealer.verifyDataKey(dataKey, seal, OPERATOR))) throw new Error("wrong key")
      return this.store.unlock(OPERATOR, dataKey, ttlSeconds)
    } finally {
      wipe(dataKey)
    }
  }

  lock() { this.store.lock(OPERATOR) }

  status() {
    const sealed = !!getSeal(this.db)
    const s = this.store.status(OPERATOR)
    return {
      sealed,
      legacy_plaintext: hasLegacyPlaintext(this.db),
      unlocked: s.unlocked,
      expires_at: s.expiresAt,
      state: !sealed ? "not configured" : s.unlocked ? "unlocked" : LOCKED_MESSAGE,
    }
  }

  /** Decrypt just before use. Returns null while locked. Do not keep the result. */
  async secrets(): Promise<MailSecrets | null> {
    const key = this.store.get(OPERATOR)
    const blob = getSealedBlob(this.db)
    if (!key || !blob) return null
    const m = (await sealer.unsealSecrets(key, blob, OPERATOR)) as Record<string, string>
    return { SMTP_PASS: m.SMTP_PASS ?? "", IMAP_PASS: m.IMAP_PASS || m.SMTP_PASS || "" }
  }
}

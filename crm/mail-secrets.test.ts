import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import {
  LOCKED_MESSAGE, MailVault, OPERATOR, countLegacyRows, getSeal, hasLegacyPlaintext,
  readLegacyForMigration, saveSealedConfig, sealer, serverConfig,
} from "./mail-secrets"

const PHRASE = "correct horse battery"
// Low iteration counts are refused by the package, so seal once and reuse.
const fixture = (async () => {
  const { dek, seal, recoveryKey } = await sealer.createSeal(PHRASE, OPERATOR)
  const secrets = await sealer.sealSecrets(dek, { SMTP_PASS: "app-pass-1", IMAP_PASS: "app-pass-1" }, OPERATOR)
  return { dek, seal, recoveryKey, secrets }
})()

function freshDb() {
  const db = new Database(":memory:")
  db.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
  return db
}

function raw(db: Database) {
  return (db.query("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>)
    .map((r) => r.value).join("\n")
}

describe("sealed mail password", () => {
  test("stores ciphertext only, never the plaintext", async () => {
    const f = await fixture
    const db = freshDb()
    saveSealedConfig(db, "me@example.com", f.seal, f.secrets)
    expect(raw(db)).not.toContain("app-pass-1")
    expect(serverConfig(db, "smtp_config")).toEqual({ host: "smtp.gmail.com", port: 587, secure: false, user: "me@example.com" })
    expect(getSeal(db)).not.toBeNull()
  }, 30_000)

  test("locked until unlocked; wrong key refused; lock drops it", async () => {
    const f = await fixture
    const db = freshDb()
    saveSealedConfig(db, "me@example.com", f.seal, f.secrets)
    const logs: string[] = []
    const vault = new MailVault(db, (m) => logs.push(m))
    expect(vault.status().state).toBe(LOCKED_MESSAGE)
    expect(await vault.secrets()).toBeNull()

    await expect(vault.unlock(new Uint8Array(32))).rejects.toThrow()
    expect(vault.status().unlocked).toBe(false)

    const dek = await sealer.unlockSeal(f.seal, PHRASE, OPERATOR)
    await vault.unlock(dek, 3600)
    expect(dek.every((b) => b === 0)).toBe(true) // caller copy wiped
    expect(vault.status().unlocked).toBe(true)
    expect(await vault.secrets()).toEqual({ SMTP_PASS: "app-pass-1", IMAP_PASS: "app-pass-1" })

    vault.lock()
    expect(vault.status().state).toBe(LOCKED_MESSAGE)
    expect(await vault.secrets()).toBeNull()
    expect(logs.filter((l) => l.includes("operator keys locked")).length).toBe(1)
    vault.announceLocked() // a second poll while still locked does not re-alert
    expect(logs.length).toBe(1)
  }, 30_000)

  test("a restart (new vault) starts locked", async () => {
    const f = await fixture
    const db = freshDb()
    saveSealedConfig(db, "me@example.com", f.seal, f.secrets)
    const a = new MailVault(db, () => {})
    await a.unlock(new Uint8Array(f.dek), 3600)
    const b = new MailVault(db, () => {})
    expect(b.status().unlocked).toBe(false)
    expect(await b.secrets()).toBeNull()
  }, 30_000)

  test("recovery key opens the same seal", async () => {
    const f = await fixture
    const dek = await sealer.unlockSealWithRecovery(f.seal, f.recoveryKey, OPERATOR)
    expect(await sealer.verifyDataKey(dek, f.seal, OPERATOR)).toBe(true)
  }, 30_000)

  test("legacy plaintext migrates once and is stripped", async () => {
    const f = await fixture
    const db = freshDb()
    const put = (k: string, v: unknown) => db.query("INSERT INTO settings (key, value) VALUES (?, ?)").run(k, JSON.stringify(v))
    put("smtp_config", { host: "smtp.gmail.com", port: 587, secure: false, user: "me@example.com", pass: "legacy-pw" })
    put("imap_config", { host: "imap.gmail.com", port: 993, secure: true, user: "me@example.com", pass: "legacy-pw" })
    expect(hasLegacyPlaintext(db)).toBe(true)
    expect(countLegacyRows(db)).toBe(2)
    expect(serverConfig(db, "smtp_config")).not.toHaveProperty("pass")
    expect(readLegacyForMigration(db, { LEGACY_KEY_MIGRATION: "off" })).toBeNull()

    const legacy = readLegacyForMigration(db, {})
    expect(legacy).toEqual({ SMTP_PASS: "legacy-pw", IMAP_PASS: "legacy-pw" })
    const secrets = await sealer.sealSecrets(f.dek, legacy!, OPERATOR)
    saveSealedConfig(db, "me@example.com", f.seal, secrets)
    expect(countLegacyRows(db)).toBe(0)
    expect(raw(db)).not.toContain("legacy-pw")

    const vault = new MailVault(db, () => {})
    await vault.unlock(new Uint8Array(f.dek), 3600)
    expect((await vault.secrets())?.SMTP_PASS).toBe("legacy-pw")
  }, 30_000)

  test("no env fallback: SMTP_PASS in the environment is never used", async () => {
    const f = await fixture
    process.env.SMTP_PASS = "from-env"
    process.env.IMAP_PASS = "from-env"
    try {
      const db = freshDb()
      saveSealedConfig(db, "me@example.com", f.seal, f.secrets)
      const vault = new MailVault(db, () => {})
      expect(await vault.secrets()).toBeNull()
    } finally {
      delete process.env.SMTP_PASS
      delete process.env.IMAP_PASS
    }
  }, 30_000)
})

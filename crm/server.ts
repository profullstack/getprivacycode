import { Elysia } from "elysia"
import { Database } from "bun:sqlite"
import { randomUUID } from "crypto"
import { mkdirSync } from "fs"
import nodemailer from "nodemailer"
import { ImapFlow } from "imapflow"
import {
  LOCKED_MESSAGE, MailVault, OPERATOR, OPERATOR_TTL_SECONDS, PROTECTED_KEYS, countLegacyRows, decodeDataKey,
  getSeal, legacyMigrationEnabled, readLegacyForMigration, saveSealedConfig, sealer, serverConfig,
} from "./mail-secrets"
import { parseTtl } from "@profullstack/sealed-secrets"

const DIR = import.meta.dir
const DB_PATH = process.env.CRM_DB_PATH || DIR + "/data/crm.db"
// Local operator tool with no login: listen on loopback unless told otherwise.
const HOST = process.env.CRM_HOST || "127.0.0.1"
const PORT = Number(process.env.CRM_PORT || 3001)

if (!process.env.CRM_DB_PATH) mkdirSync(DIR + "/data", { recursive: true })
const db = new Database(DB_PATH)
db.exec("PRAGMA journal_mode=WAL")
db.exec("PRAGMA foreign_keys=ON")
// Overwritten rows (a replaced or migrated password) are zeroed, not left in free pages.
db.exec("PRAGMA secure_delete=ON")

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    title TEXT,
    email TEXT,
    phone TEXT,
    linkedin TEXT,
    stage TEXT DEFAULT 'new',
    source TEXT DEFAULT 'manual',
    notes TEXT,
    tags TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL,
    type TEXT NOT NULL,
    subject TEXT,
    body TEXT,
    direction TEXT DEFAULT 'outbound',
    status TEXT DEFAULT 'sent',
    scheduled_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
  CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
  CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);
`)

const STAGES = ["new", "emailed", "replied", "meeting", "negotiation", "closed_won", "closed_lost"]

function now() { return new Date().toISOString() }
function newId() { return randomUUID() }

// --- Email (password sealed; see mail-secrets.ts) ---
const vault = new MailVault(db)
let transporter: nodemailer.Transporter | null = null
let imapClient: ImapFlow | null = null

function getEmailConfig() {
  const row = db.query("SELECT value FROM settings WHERE key=?").get("email_config") as { value: string } | null
  if (!row) return null
  try { return JSON.parse(row.value) } catch { return null }
}

// Lock, expiry or restart: drop every live connection that holds the password.
vault.store.onChange((_user, unlocked) => {
  if (unlocked) return
  try { transporter?.close() } catch {}
  transporter = null
  if (imapClient) { try { imapClient.close() } catch {} }
  imapClient = null
})

async function initTransporter() {
  const config = serverConfig(db, "smtp_config")
  const secrets = await vault.secrets()
  if (!config || !secrets) { transporter = null; return null }
  transporter = nodemailer.createTransport({
    host: config.host || "smtp.gmail.com",
    port: config.port || 587,
    secure: config.secure || false,
    auth: { user: config.user, pass: secrets.SMTP_PASS },
  })
  try { await transporter.verify(); return transporter }
  catch { transporter = null; return null }
}

async function initImap() {
  const config = serverConfig(db, "imap_config")
  const secrets = await vault.secrets()
  if (!config || !secrets) return false
  if (imapClient) { try { imapClient.close() } catch {} }
  imapClient = new ImapFlow({
    host: config.host || "imap.gmail.com",
    port: config.port || 993,
    secure: true,
    auth: { user: config.user || "", pass: secrets.IMAP_PASS },
    logger: false,
  })
  try { await imapClient.connect(); return true }
  catch { imapClient = null; return false }
}

async function checkEmail() {
  if (!vault.status().unlocked) { if (getSeal(db)) vault.announceLocked(); return [] }
  if (!imapClient) { const ok = await initImap(); if (!ok) return [] }
  if (!imapClient) return []
  try {
    const lock = await imapClient.getMailboxLock("INBOX")
    try {
      const unseen = (await imapClient.search({ seen: false })) || []
      const messages: Array<{ id: string; from: string; subject: string; text: string; date: string }> = []
      for (const uid of unseen.slice(-20)) {
        const msg = await imapClient.fetchOne(uid, { envelope: true, source: true, bodyStructure: true })
        if (!msg) continue
        const env = msg.envelope
        if (!env) continue
        const from = env.from?.[0]
        const fromEmail = from?.address || ""
        const existingLeads = db.query("SELECT id FROM leads WHERE email=?").all(fromEmail) as Array<{ id: string }>
        if (existingLeads.length === 0) continue
        const subject = env.subject || "(no subject)"
        const text = msg.source?.toString().substring(0, 5000) || ""
        const date = env.date ? new Date(env.date).toISOString() : now()

        for (const lead of existingLeads) {
          db.query(`INSERT INTO activities (id, lead_id, type, subject, body, direction, status, created_at)
            VALUES (?,?, 'email', ?, ?, 'inbound', 'replied', ?)`)
            .run(newId(), lead.id, subject, text, date)
          db.query("UPDATE leads SET stage=? WHERE id=? AND stage NOT IN ('closed_won','closed_lost')")
            .run("replied", lead.id)
        }
        messages.push({ id: uid.toString(), from: fromEmail, subject, text, date })
      }
      return messages
    } finally { lock.release() }
  } catch { return [] }
}

// Seed templates if empty
const tplCount = (db.query("SELECT COUNT(*) as c FROM templates").get() as { c: number }).c
if (tplCount === 0) {
  const seed = [
    ["Cold Outreach - CISO", "AI coding at {company}?", `Hi {first_name},

Quick one — do your devs use AI coding tools (Claude, ChatGPT, Copilot)?

Most eng teams I talk to already do. The problem is that code pasted into these tools often contains API keys, customer PII, or proprietary logic that ends up on third-party servers.

I built PrivacyCode — an open-source CLI that tokenizes sensitive data before it reaches AI providers. For SOC 2 / HIPAA orgs, this means:
- Devs use any AI tool
- Provider never sees real data
- No BAA needed
- Full audit trail

Worth 30 min to see a live demo?

Best,
[Your name]`, "cold"],

    ["Cold Outreach - VP Eng", "AI coding at {company}?", `Hi {first_name},

Your devs want AI coding tools. Compliance is blocking it.

I built PrivacyCode — an open-source CLI that runs silently on dev machines and tokenizes PII/PHI/credentials before anything reaches the AI provider.

No proxy. No cloud. No change to how your devs work. Deployed at HIPAA orgs in 2 days.

Want to see a 2-min demo?

Best,
[Your name]`, "cold"],

    ["Follow Up - Case Study", "How a HIPAA org deployed AI tools in 2 days", `Hi {first_name},

Following up on my last email.

We recently deployed PrivacyCode at a HIPAA-covered organization with 50 engineers. They went from "no AI tools allowed" to full Claude/GPT access with compliance sign-off.

Key result: PHI never reached the AI provider because it was tokenized on-device.

I put together a one-page summary. Happy to share it.

Is this relevant to what you're working on?

Best,
[Your name]`, "followup"],

    ["Meeting Request", "Quick chat about AI compliance", `Hi {first_name},

Would you have 20 minutes this week to hop on a quick call?

I'd love to understand your team's AI coding situation and share how other SOC 2/HIPAA orgs are handling it.

No pitch — just a conversation.

Best,
[Your name]`, "meeting"],

    ["Closing - Proposal", "PrivacyCode deployment for {company}", `Hi {first_name},

Based on our conversation, here's what I'd recommend for {company}:

- PrivacyCode deployment (up to {team_size} devs)
- Defender tokenization configured for your stack
- SSO/SAML integration
- Audit log pipeline to your SIEM
- Team training session
- Ongoing support

Timeline: 2 days to full deployment
Pricing: [your pricing]

Ready to move forward? I can start the setup this week.

Best,
[Your name]`, "close"],
  ]
  const ins = db.prepare("INSERT INTO templates (id, name, subject, body, category, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
  for (const [name, subject, body, cat] of seed) {
    const t = now()
    ins.run(newId(), name, subject, body, cat, t, t)
  }
}

// --- Server ---
// Only these files are served: never the data/ directory (crm.db) or the source.
const INDEX = Bun.file(DIR + "/index.html")
const SEALED_SECRETS_DIR = DIR + "/node_modules/@profullstack/sealed-secrets/src/"
const VENDOR = new Set(["index.js", "seal.js", "unlock-store.js"])

const app = new Elysia()
  .get("/", () => new Response(INDEX, { headers: { "content-type": "text/html; charset=utf-8" } }))
  .get("/index.html", () => new Response(INDEX, { headers: { "content-type": "text/html; charset=utf-8" } }))
  .get("/vendor/sealed-secrets/:file", ({ params: { file }, set }) => {
    if (!VENDOR.has(file)) { set.status = 404; return { error: "not found" } }
    return new Response(Bun.file(SEALED_SECRETS_DIR + file), { headers: { "content-type": "text/javascript; charset=utf-8" } })
  })
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") return { error: error.message }
    if (code === "NOT_FOUND") { set.status = 404; return { error: "not found" } }
    // Route handlers throw plain Errors with user-facing messages ("Email ... locked: unlock to resume").
    if (code === "UNKNOWN" && error instanceof Error) { set.status = 400; return { error: error.message } }
    console.error(error)
    return { error: "Internal error" }
  })

// --- Dashboard ---
app.get("/api/dashboard", () => {
  const pipeline = db.query("SELECT stage, COUNT(*) as count FROM leads GROUP BY stage").all() as Array<{ stage: string; count: number }>
  const counts: Record<string, number> = {}
  for (const s of STAGES) counts[s] = 0
  for (const r of pipeline) counts[r.stage] = r.count
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const recent = db.query(`SELECT l.id, l.name, l.company, l.stage, l.email,
    (SELECT a.type FROM activities a WHERE a.lead_id=l.id ORDER BY a.created_at DESC LIMIT 1) as last_activity_type,
    (SELECT a.created_at FROM activities a WHERE a.lead_id=l.id ORDER BY a.created_at DESC LIMIT 1) as last_contact
    FROM leads l ORDER BY last_contact DESC LIMIT 10`).all()
  return { pipeline: counts, total, recent }
})

// --- Leads ---
app.get("/api/leads", ({ query }) => {
  const { stage, search } = query
  let sql = "SELECT * FROM leads WHERE 1=1"
  const params: Array<string> = []
  if (stage && stage !== "all") { sql += " AND stage=?"; params.push(stage as string) }
  if (search) { sql += " AND (name LIKE ? OR company LIKE ? OR email LIKE ?)"; const s = `%${search}%`; params.push(s, s, s) }
  sql += " ORDER BY updated_at DESC"
  return db.query(sql).all(...params)
})

app.post("/api/leads", ({ body }: { body: any }) => {
  const { name, company, title, email, phone, linkedin, source, notes, tags, stage } = body
  if (!name) throw new Error("Name is required")
  const lead = { id: newId(), name, company: company || "", title: title || "", email: email || "", phone: phone || "", linkedin: linkedin || "", stage: stage || "new", source: source || "manual", notes: notes || "", tags: tags || "", created_at: now(), updated_at: now() }
  db.query(`INSERT INTO leads (id, name, company, title, email, phone, linkedin, stage, source, notes, tags, created_at, updated_at) VALUES ($id, $name, $company, $title, $email, $phone, $linkedin, $stage, $source, $notes, $tags, $created_at, $updated_at)`).run(lead)
  return lead
})

app.get("/api/leads/:id", ({ params: { id } }) => {
  const lead = db.query("SELECT * FROM leads WHERE id=?").get(id) as any
  if (!lead) throw new Error("Lead not found")
  const activities = db.query("SELECT * FROM activities WHERE lead_id=? ORDER BY created_at DESC").all(id)
  return { ...lead, activities }
})

app.put("/api/leads/:id", ({ params: { id }, body }: { params: { id: string }; body: any }) => {
  const existing = db.query("SELECT * FROM leads WHERE id=?").get(id) as any
  if (!existing) throw new Error("Lead not found")
  const fields = ["name", "company", "title", "email", "phone", "linkedin", "stage", "source", "notes", "tags"]
  const updates: Array<string> = []; const params: Array<any> = []
  for (const f of fields) {
    if (body[f] !== undefined) { updates.push(`${f}=?`); params.push(body[f]) }
  }
  if (updates.length === 0) return existing
  updates.push("updated_at=?")
  params.push(now(), id)
  db.query(`UPDATE leads SET ${updates.join(",")} WHERE id=?`).run(...params)
  return db.query("SELECT * FROM leads WHERE id=?").get(id)
})

app.put("/api/leads/:id/stage", ({ params: { id }, body }: { params: { id: string }; body: any }) => {
  const { stage } = body
  if (!STAGES.includes(stage)) throw new Error("Invalid stage")
  const existing = db.query("SELECT * FROM leads WHERE id=?").get(id) as any
  if (!existing) throw new Error("Lead not found")
  db.query("UPDATE leads SET stage=?, updated_at=? WHERE id=?").run(stage, now(), id)
  db.query("INSERT INTO activities (id, lead_id, type, subject, body, direction, status, created_at) VALUES (?,?, 'system', ?, ?, 'outbound', 'completed', ?)")
    .run(newId(), id, `Moved to ${stage.replace("_", " ")}`, `Stage changed from ${existing.stage} to ${stage}`, now())
  return db.query("SELECT * FROM leads WHERE id=?").get(id)
})

app.delete("/api/leads/:id", ({ params: { id } }) => {
  db.query("DELETE FROM leads WHERE id=?").run(id)
  return { ok: true }
})

app.post("/api/leads/import-csv", ({ body }: { body: any }) => {
  const { csv } = body
  if (!csv) throw new Error("CSV content required")
  const lines = csv.split("\n").filter((l: string) => l.trim())
  if (lines.length < 2) throw new Error("CSV must have header + data rows")
  const headers = lines[0].split(",").map((h: string) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""))
  const nameIdx = headers.indexOf("name"); const emailIdx = headers.indexOf("email")
  const companyIdx = headers.indexOf("company"); const titleIdx = headers.indexOf("title")
  const stage = "new"; const imported: Array<any> = []
  const ins = db.prepare(`INSERT INTO leads (id, name, company, title, email, stage, source, notes, tags, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",").map((v: string) => v.trim().replace(/^["']|["']$/g, ""))
    const name = nameIdx >= 0 ? vals[nameIdx] : ""
    if (!name) continue
    const email = emailIdx >= 0 ? vals[emailIdx] || "" : ""
    const company = companyIdx >= 0 ? vals[companyIdx] || "" : ""
    const title = titleIdx >= 0 ? vals[titleIdx] || "" : ""
    const t = now()
    ins.run(newId(), name, company, title, email, stage, "csv", "", "", t, t)
    imported.push({ name, company, title, email })
  }
  return { imported: imported.length }
})

// --- Activities ---
app.get("/api/leads/:id/activities", ({ params: { id } }) => {
  return db.query("SELECT * FROM activities WHERE lead_id=? ORDER BY created_at DESC").all(id)
})

app.post("/api/leads/:id/activities", ({ params: { id }, body }: { params: { id: string }; body: any }) => {
  const { type, subject, body: b, direction, status, scheduled_at } = body
  if (!type) throw new Error("Type is required")
  const a = { id: newId(), lead_id: id, type, subject: subject || "", body: b || "", direction: direction || "outbound", status: status || "completed", scheduled_at: scheduled_at || null, created_at: now() }
  db.query("INSERT INTO activities (id, lead_id, type, subject, body, direction, status, scheduled_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(a.id, a.lead_id, a.type, a.subject, a.body, a.direction, a.status, a.scheduled_at, a.created_at)
  return a
})

app.get("/api/activities", ({ query }) => {
  const { limit } = query
  const n = Math.min(parseInt(limit as string) || 50, 200)
  return db.query(`SELECT a.*, l.name as lead_name, l.company as lead_company FROM activities a JOIN leads l ON a.lead_id=l.id ORDER BY a.created_at DESC LIMIT ?`).all(n)
})

// --- Templates ---
app.get("/api/templates", () => {
  return db.query("SELECT * FROM templates ORDER BY category, name").all()
})

app.post("/api/templates", ({ body }: { body: any }) => {
  const { name, subject, body: b, category } = body
  if (!name || !b) throw new Error("Name and body are required")
  const t = now()
  const tmpl = { id: newId(), name, subject: subject || "", body: b, category: category || "general", created_at: t, updated_at: t }
  db.query("INSERT INTO templates (id, name, subject, body, category, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").run(tmpl.id, tmpl.name, tmpl.subject, tmpl.body, tmpl.category, tmpl.created_at, tmpl.updated_at)
  return tmpl
})

app.put("/api/templates/:id", ({ params: { id }, body }: { params: { id: string }; body: any }) => {
  const fields = ["name", "subject", "body", "category"]
  const updates: Array<string> = []; const params: Array<any> = []
  for (const f of fields) {
    if (body[f] !== undefined) { updates.push(`${f}=?`); params.push(body[f]) }
  }
  if (updates.length === 0) return { ok: true }
  updates.push("updated_at=?")
  params.push(now(), id)
  db.query(`UPDATE templates SET ${updates.join(",")} WHERE id=?`).run(...params)
  return db.query("SELECT * FROM templates WHERE id=?").get(id)
})

app.delete("/api/templates/:id", ({ params: { id } }) => {
  db.query("DELETE FROM templates WHERE id=?").run(id)
  return { ok: true }
})

// --- Email ---
// The app password is sealed in the browser (or cli.ts) under the operator's passphrase.
// The server stores only the seal record + ciphertext, and holds the data key in memory
// while unlocked (TTL default 7d, Lock, restart = locked).
app.get("/api/email/status", () => {
  const smtp = serverConfig(db, "smtp_config")
  const imap = serverConfig(db, "imap_config")
  const v = vault.status()
  return {
    configured: !!smtp && !!imap && v.sealed,
    smtp: !!smtp, imap: !!imap,
    email: getEmailConfig()?.email || "",
    ...v,
    legacy_migration: legacyMigrationEnabled(),
  }
})

// Seal record only (salt, KDF params, wrapped key): what a client needs to derive the data key.
app.get("/api/email/seal", () => ({ seal: getSeal(db) }))

app.post("/api/email/save-config", async ({ body, set }: { body: any; set: any }) => {
  const { email, seal, secrets, data_key, ttl } = body ?? {}
  if (!email) throw new Error("Email is required")
  if (body?.smtp_pass || body?.imap_pass) {
    set.status = 400
    return { error: "Plaintext passwords are not accepted. Seal them in the browser or with cli.ts." }
  }
  const key = decodeDataKey(data_key)
  if (!(await sealer.verifyDataKey(key, seal, OPERATOR))) { key.fill(0); set.status = 400; return { error: "Seal does not match the data key" } }
  const existing = getSeal(db)
  if (existing && JSON.stringify(existing) !== JSON.stringify(seal) && vault.status().unlocked) {
    // Replacing a seal while unlocked under the old one: lock first so the old key is dropped.
    vault.lock()
  }
  saveSealedConfig(db, email, seal, secrets)
  await vault.unlock(key, ttl ? parseTtl(String(ttl)) : OPERATOR_TTL_SECONDS)
  await initTransporter()
  await initImap()
  return { ok: true, ...vault.status() }
})

app.post("/api/email/unlock", async ({ body, set }: { body: any; set: any }) => {
  try {
    const key = decodeDataKey(body?.data_key)
    const r = await vault.unlock(key, body?.ttl ? parseTtl(String(body.ttl)) : OPERATOR_TTL_SECONDS)
    return { ok: true, ...r }
  } catch (e: any) {
    set.status = 400
    return { error: e?.message === "mail is not set up" ? e.message : "Wrong passphrase or key" }
  }
})

app.post("/api/email/lock", () => { vault.lock(); return { ok: true, ...vault.status() } })

// One-shot legacy migration: hands the pre-seal plaintext to the operator's browser so it
// can be sealed; save-config then strips it. LEGACY_KEY_MIGRATION=off closes this path.
app.post("/api/email/legacy", ({ set }: { set: any }) => {
  const legacy = readLegacyForMigration(db)
  if (!legacy) { set.status = 404; return { error: "No legacy plaintext to migrate" } }
  return legacy
})

app.get("/api/email/legacy-count", () => ({ unmigrated_rows: countLegacyRows(db) }))

app.post("/api/email/send", async ({ body }: { body: any }) => {
  const { to, subject, body: b, lead_id } = body
  if (!to || !subject || !b) throw new Error("to, subject, body required")
  if (!vault.status().unlocked) throw new Error(getSeal(db) ? `Email ${LOCKED_MESSAGE}. Go to Settings to unlock.` : "Email not configured. Go to Settings to set up Gmail.")
  if (!transporter) { const ok = await initTransporter(); if (!ok) throw new Error("Email could not connect. Check the address and app password in Settings.") }
  const config = getEmailConfig()
  const from = config?.email || "you@gmail.com"
  const info = await transporter!.sendMail({ from: `PrivacyCode CRM <${from}>`, to, subject, text: b })
  if (lead_id) {
    db.query("INSERT INTO activities (id, lead_id, type, subject, body, direction, status, created_at) VALUES (?,?, 'email', ?, ?, 'outbound', 'sent', ?)")
      .run(newId(), lead_id, subject, b, now())
    db.query("UPDATE leads SET stage=?, updated_at=? WHERE id=? AND stage IN ('new', '')").run("emailed", now(), lead_id)
  }
  return { messageId: info.messageId, accepted: info.accepted }
})

app.post("/api/email/check", async () => {
  if (!vault.status().unlocked) return { messages: 0, state: vault.status().state }
  const messages = await checkEmail()
  return { messages: messages.length }
})

// --- Settings ---
app.get("/api/settings", () => {
  const rows = db.query("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>
  const settings: Record<string, any> = {}
  for (const r of rows) {
    if (r.key === "mail_seal" || r.key === "mail_secrets") continue
    try { settings[r.key] = JSON.parse(r.value) } catch { settings[r.key] = r.value }
    if (settings[r.key] && typeof settings[r.key] === "object") delete settings[r.key].pass
  }
  return settings
})

app.put("/api/settings", ({ body }: { body: any }) => {
  for (const [key, value] of Object.entries(body)) {
    if (PROTECTED_KEYS.has(key)) throw new Error(`${key} is managed by the email settings`)
    db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, JSON.stringify(value))
  }
  return { ok: true }
})

app.listen({ hostname: HOST, port: PORT })
console.log(`\n  ✦ PrivacyCode CRM running at http://${HOST}:${PORT}\n`)
if (getSeal(db)) console.warn(`  email: ${LOCKED_MESSAGE} (Settings page or \`bun cli.ts unlock\`)`)
if (countLegacyRows(db) > 0) console.warn(`  email: legacy plaintext password on file; open Settings to seal it`)

// Background email checking every 60s; pauses while locked.
setInterval(async () => {
  try { await checkEmail() } catch {}
}, 60000)

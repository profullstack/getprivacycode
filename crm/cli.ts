// Operator CLI for the CRM's sealed Gmail password.
//
//   bun cli.ts status
//   bun cli.ts unlock [--ttl 7d]     # prompts for the passphrase (or recovery key)
//   bun cli.ts lock
//
// The passphrase never leaves this process: the data key is derived here and only that
// key is posted to the CRM, which holds it in memory until the TTL ends.
import { bytesToBase64, parseTtl, wipe } from "@profullstack/sealed-secrets"
import { OPERATOR, sealer } from "./mail-secrets"

const BASE = process.env.CRM_URL || `http://127.0.0.1:${process.env.CRM_PORT || 3001}`

async function call(path: string, body?: unknown) {
  const res = await fetch(BASE + path, body === undefined ? undefined : {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })
  const data = (await res.json()) as any
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

async function readHidden(label: string): Promise<string> {
  process.stdout.write(label)
  const stdin = process.stdin
  if (!stdin.isTTY) {
    for await (const chunk of stdin) return String(chunk).split(/\r?\n/)[0]
    return ""
  }
  stdin.setRawMode(true)
  stdin.resume()
  let out = ""
  return await new Promise((resolve, reject) => {
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") { done(); return resolve(out) }
        if (ch === "\u0003") { done(); return reject(new Error("cancelled")) }
        if (ch === "\u007f") out = out.slice(0, -1)
        else out += ch
      }
    }
    const done = () => { stdin.off("data", onData); stdin.setRawMode(false); stdin.pause(); process.stdout.write("\n") }
    stdin.on("data", onData)
  })
}

const [cmd, ...rest] = process.argv.slice(2)
const ttlIdx = rest.indexOf("--ttl")
const ttl = ttlIdx >= 0 ? rest[ttlIdx + 1] : "7d"

try {
  if (cmd === "status") {
    const s = await call("/api/email/status")
    console.log(`email: ${s.email || "(none)"}  state: ${s.state}${s.expires_at ? `  until ${s.expires_at}` : ""}`)
    if (s.legacy_plaintext) console.log("legacy plaintext password on file: open Settings to seal it")
  } else if (cmd === "unlock") {
    parseTtl(ttl)
    const { seal } = await call("/api/email/seal")
    if (!seal) throw new Error("mail is not set up; connect Gmail in the Settings page first")
    const phrase = await readHidden("Passphrase or recovery key: ")
    let dek: Uint8Array
    try { dek = await sealer.unlockSeal(seal, phrase, OPERATOR) }
    catch { dek = await sealer.unlockSealWithRecovery(seal, phrase, OPERATOR).catch(() => { throw new Error("wrong passphrase or recovery key") }) }
    try {
      const r = await call("/api/email/unlock", { data_key: bytesToBase64(dek), ttl })
      console.log(`unlocked until ${r.expiresAt}`)
    } finally { wipe(dek) }
  } else if (cmd === "lock") {
    await call("/api/email/lock", {})
    console.log("locked")
  } else {
    console.log("usage: bun cli.ts status | unlock [--ttl 7d] | lock")
    process.exit(cmd ? 1 : 0)
  }
} catch (e: any) {
  console.error(`error: ${e?.message || e}`)
  process.exit(1)
}

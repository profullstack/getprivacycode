export * as ConfigManaged from "./managed"

import { existsSync } from "fs"
import os from "os"
import path from "path"
import { Process } from "@/util/process"

const MANAGED_PLIST_DOMAIN = "ai.opencode.managed"

// Keys injected by macOS/MDM into the managed plist that are not OpenCode config
const PLIST_META = new Set([
  "PayloadDisplayName",
  "PayloadIdentifier",
  "PayloadType",
  "PayloadUUID",
  "PayloadVersion",
  "_manualProfile",
])

// Admin-deployed managed config lives under a directory named after this
// project. The pre-rename `opencode` location is still honoured when it is the
// only one present, so existing managed deployments keep working.
function systemManagedConfigDirs(): string[] {
  switch (process.platform) {
    case "darwin":
      return ["/Library/Application Support/privacycode", "/Library/Application Support/opencode"]
    case "win32": {
      const base = process.env.ProgramData || "C:\\ProgramData"
      return [path.join(base, "privacycode"), path.join(base, "opencode")]
    }
    default:
      return ["/etc/privacycode", "/etc/opencode"]
  }
}

function systemManagedConfigDir(): string {
  const candidates = systemManagedConfigDirs()
  for (const dir of candidates) {
    try {
      if (existsSync(dir)) return dir
    } catch {
      // ignore and fall through to the default
    }
  }
  return candidates[0]!
}

export function managedConfigDir() {
  return process.env.PRIVACYCODE_TEST_MANAGED_CONFIG_DIR || systemManagedConfigDir()
}

export function parseManagedPlist(json: string): string {
  const raw = JSON.parse(json)
  for (const key of Object.keys(raw)) {
    if (PLIST_META.has(key)) delete raw[key]
  }
  return JSON.stringify(raw)
}

export async function readManagedPreferences() {
  if (process.platform !== "darwin") return

  const user = (() => {
    try {
      return os.userInfo().username || "user"
    } catch {
      return "user"
    }
  })()
  const paths = [
    path.join("/Library/Managed Preferences", user, `${MANAGED_PLIST_DOMAIN}.plist`),
    path.join("/Library/Managed Preferences", `${MANAGED_PLIST_DOMAIN}.plist`),
  ]

  for (const plist of paths) {
    if (!existsSync(plist)) continue
    const result = await Process.run(["plutil", "-convert", "json", "-o", "-", plist], { nothrow: true })
    if (result.code !== 0) continue
    return {
      source: `mobileconfig:${plist}`,
      text: parseManagedPlist(result.stdout.toString()),
    }
  }

  return
}

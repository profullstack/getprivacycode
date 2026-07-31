import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  PRIVACYCODE_CHANNEL: process.env["PRIVACYCODE_CHANNEL"],
  PRIVACYCODE_BUMP: process.env["PRIVACYCODE_BUMP"],
  PRIVACYCODE_VERSION: process.env["PRIVACYCODE_VERSION"],
  PRIVACYCODE_RELEASE: process.env["PRIVACYCODE_RELEASE"],
}
const CHANNEL = await (async () => {
  if (env.PRIVACYCODE_CHANNEL) return env.PRIVACYCODE_CHANNEL
  if (env.PRIVACYCODE_BUMP) return "latest"
  if (env.PRIVACYCODE_VERSION && !env.PRIVACYCODE_VERSION.startsWith("0.0.0-")) return "latest"
  return await $`git branch --show-current`.text().then((x) => x.trim())
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.PRIVACYCODE_VERSION) return env.PRIVACYCODE_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  // Derive the next version from this repository's own latest release. This
  // used to read `registry.npmjs.org/opencode-ai/latest`, which meant the fork
  // numbered its releases from upstream opencode's npm package rather than from
  // anything it had actually shipped. Fall back to the version in the root
  // package.json when there is no release yet (first release, or a new fork).
  const repo = process.env["GH_REPO"] || process.env["GITHUB_REPOSITORY"]
  // The root package.json carries no `version`, so fall back to the CLI package.
  const fallback = await Bun.file(path.resolve(import.meta.dir, "../../privacycode/package.json"))
    .json()
    .then((pkg: any) => pkg.version)
    .catch(() => "0.0.0")
  const version = await (async () => {
    if (!repo) return fallback
    const headers: Record<string, string> = { accept: "application/vnd.github+json" }
    const token = process.env["GH_TOKEN"] || process.env["GITHUB_TOKEN"]
    if (token) headers["authorization"] = `Bearer ${token}`
    const latest = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
    const tag = (latest as any)?.tag_name
    if (typeof tag !== "string") return fallback
    return tag.replace(/^v/, "")
  })()
  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  const t = env.PRIVACYCODE_BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

const bot = ["actions-user", "opencode", "opencode-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const team = [
  ...(await Bun.file(teamPath)
    .text()
    .then((x) => x.split(/\r?\n/).map((x) => x.trim()))
    .then((x) => x.filter((x) => x && !x.startsWith("#")))),
  ...bot,
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.PRIVACYCODE_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`privacycode script`, JSON.stringify(Script, null, 2))

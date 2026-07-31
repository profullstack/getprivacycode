#!/usr/bin/env bun

import { Script } from "@privacycode-ai/script"
import { $ } from "bun"

const output = [`version=${Script.version}`]
const sha = process.env.GITHUB_SHA ?? (await $`git rev-parse HEAD`.text()).trim()

// `script/changelog.ts` generates release notes by shelling out to the
// `opencode` CLI, which is neither installed nor configured with an API key in
// this repository's CI. That is a nice-to-have, not a release blocker, so run it
// best-effort and fall back to the commit log between the last tag and this sha.
async function commitLog() {
  const previous = await $`git describe --tags --abbrev=0`
    .text()
    .then((x) => x.trim())
    .catch(() => "")
  const range = previous ? `${previous}..${sha}` : sha
  const log = await $`git log --no-merges --pretty=format:"- %s (%h)" ${range}`
    .text()
    .then((x) => x.trim())
    .catch(() => "")
  return log || "No notable changes"
}

if (!Script.preview) {
  await $`bun script/changelog.ts --to ${sha}`.cwd(process.cwd()).nothrow().quiet()
  const file = `${process.cwd()}/UPCOMING_CHANGELOG.md`
  const body = await Bun.file(file)
    .text()
    .then((x) => x.trim())
    .catch(() => "")
    .then((x) => x || commitLog())
  const dir = process.env.RUNNER_TEMP ?? "/tmp"
  const notesFile = `${dir}/privacycode-release-notes.txt`
  await Bun.write(notesFile, body)
  await $`gh release create v${Script.version} -d --target ${sha} --title "v${Script.version}" --notes-file ${notesFile}`
  const release = await $`gh release view v${Script.version} --json tagName,databaseId`.json()
  output.push(`release=${release.databaseId}`)
  output.push(`tag=${release.tagName}`)
} else if (Script.channel === "beta") {
  await $`gh release create v${Script.version} -d --title "v${Script.version}" --repo ${process.env.GH_REPO}`
  const release =
    await $`gh release view v${Script.version} --json tagName,databaseId --repo ${process.env.GH_REPO}`.json()
  output.push(`release=${release.databaseId}`)
  output.push(`tag=${release.tagName}`)
}

output.push(`repo=${process.env.GH_REPO}`)

if (process.env.GITHUB_OUTPUT) {
  await Bun.write(process.env.GITHUB_OUTPUT, output.join("\n"))
}

process.exit(0)

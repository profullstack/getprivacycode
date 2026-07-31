export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@privacycode-ai/core/flag/flag"
import { Global } from "@privacycode-ai/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@privacycode-ai/core/fs-util"

// The project-level config directory. PrivacyCode is commonly installed
// alongside opencode — moshcode, for one, drives both — and a shared
// `.opencode` directory means the two overwrite each other's project config,
// plans and themes. Everything we create therefore goes in `.privacycode`.
export const PROJECT_DIR = ".privacycode"

// Directories we read, in precedence order. `.opencode` stays readable so
// existing projects keep working and so a project can still be configured once
// for both tools; only writes are namespaced.
export const PROJECT_DIRS = [PROJECT_DIR, ".opencode"]

// Basenames of the config files inside those directories, and of the bare
// project-root config file. Same reasoning: we write `privacycode.*` and read
// both.
export const CONFIG_NAME = "privacycode"
export const CONFIG_NAMES = [CONFIG_NAME, "opencode"]

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string,
  directory: string,
  worktree?: string,
) {
  const afs = yield* FSUtil.Service
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* FSUtil.Service
  return unique([
    Global.Path.config,
    ...(!Flag.PRIVACYCODE_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          targets: PROJECT_DIRS,
          start: directory,
          stop: worktree,
        })
      : []),
    ...(yield* afs.up({
      targets: PROJECT_DIRS,
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(Flag.PRIVACYCODE_CONFIG_DIR ? [Flag.PRIVACYCODE_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}

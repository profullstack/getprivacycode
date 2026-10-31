import { LayerNode } from "@privacycode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@privacycode-ai/core/effect/app-node-builder"
import { httpClient } from "@privacycode-ai/core/effect/app-node-platform"
import { Effect, Layer, Schema, Context, Stream } from "effect"
import { serviceUse } from "@privacycode-ai/core/effect/service-use"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { errorMessage } from "@/util/error"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@privacycode-ai/core/process"
import path from "path"
import { makeRuntime } from "@privacycode-ai/core/effect/runtime"
import semver from "semver"
import { InstallationChannel, InstallationVersion } from "@privacycode-ai/core/installation/version"
import { InstallationEvent } from "@privacycode-ai/schema/installation-event"

export type Method = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "unknown"
export type ReleaseType = "patch" | "minor" | "major"

export const Event = InstallationEvent

export function getReleaseType(current: string, latest: string): ReleaseType {
  if (!semver.valid(current) || !semver.valid(latest)) return "patch"
  if (semver.major(latest) > semver.major(current)) return "major"
  if (semver.minor(latest) > semver.minor(current)) return "minor"
  return "patch"
}

export function isUpdate(current: string, latest: string) {
  if (!semver.valid(latest)) return false
  if (!semver.valid(current)) return semver.major(latest) === 1
  return semver.major(latest) === semver.major(current) && semver.gt(latest, current)
}

export const Info = Schema.Struct({
  version: Schema.String,
  latest: Schema.String,
}).annotate({ identifier: "InstallationInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export function userAgent(client = "cli") {
  return `privacycode/${InstallationChannel}/${InstallationVersion}/${client}`
}

export const USER_AGENT = userAgent()

export function isPreview() {
  return InstallationChannel !== "latest"
}

export function isLocal() {
  return InstallationChannel === "local"
}

export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {
  override get message() {
    return this.stderr
  }
}

const GitHubRelease = Schema.Struct({ tag_name: Schema.String })

export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  readonly latest: (method?: Method) => Effect.Effect<string>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
  readonly upgradeMajor: (method: Method) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@privacycode/Installation") {}

export const use = serviceUse(Service)

const layer: Layer.Layer<Service, never, HttpClient.HttpClient | AppProcess.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const httpOk = HttpClient.filterStatusOk(withTransientReadRetry(http))
    const appProcess = yield* AppProcess.Service

    const text = Effect.fnUntraced(
      function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
        const result = yield* appProcess.run(
          ChildProcess.make(cmd[0], cmd.slice(1), {
            cwd: opts?.cwd,
            env: opts?.env,
            extendEnv: true,
          }),
        )
        return result.stdout.toString("utf8")
      },
      Effect.catch(() => Effect.succeed("")),
    )

    const run = Effect.fnUntraced(
      function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
        const result = yield* appProcess.run(
          ChildProcess.make(cmd[0], cmd.slice(1), {
            cwd: opts?.cwd,
            env: opts?.env,
            extendEnv: true,
          }),
        )
        return {
          code: result.exitCode,
          stdout: result.stdout.toString("utf8"),
          stderr: result.stderr.toString("utf8"),
        }
      },
      Effect.catch((err) => Effect.succeed({ code: 1, stdout: "", stderr: errorMessage(err) })),
    )

    const upgradeFailure = (result?: { code: number; stdout: string; stderr: string }) => {
      if (result) return `Upgrade failed (exit code ${result.code}).`
      return "Upgrade failed."
    }

    const upgradeScriptShell = Effect.fnUntraced(function* () {
      const bashVersion = yield* text(["bash", "--version"])
      if (bashVersion) return "bash"
      return "sh"
    })

    const upgradeCurl = Effect.fnUntraced(
      function* (target: string) {
        const response = yield* httpOk.execute(HttpClientRequest.get("https://getprivacycode.com/install.sh"))
        const body = yield* response.text
        const bodyBytes = new TextEncoder().encode(body)
        const shell = yield* upgradeScriptShell()
        const result = yield* appProcess.run(
          ChildProcess.make(shell, [], {
            stdin: Stream.make(bodyBytes),
            env: { VERSION: target },
            extendEnv: true,
          }),
        )
        return {
          code: result.exitCode,
          stdout: result.stdout.toString("utf8"),
          stderr: result.stderr.toString("utf8"),
        }
      },
      Effect.mapError(() => new UpgradeFailedError({ stderr: upgradeFailure() })),
    )

    const result: Interface = {
      info: Effect.fn("Installation.info")(function* () {
        return {
          version: InstallationVersion,
          latest: yield* result.latest(),
        }
      }),
      method: Effect.fn("Installation.method")(function* () {
        // The installer uses ~/.privacycode/bin. Keep legacy paths on the same self-hosted update flow.
        if (
          process.execPath.includes(path.join(".privacycode", "bin")) ||
          process.execPath.includes(path.join(".opencode", "bin")) ||
          process.execPath.includes(path.join(".local", "bin"))
        )
          return "curl" as Method
        return "unknown" as Method
      }),
      latest: Effect.fn("Installation.latest")(function* () {
        const response = yield* httpOk.execute(
          HttpClientRequest.get("https://api.github.com/repos/profullstack/getprivacycode/releases/latest").pipe(
            HttpClientRequest.acceptJson,
          ),
        )
        const data = yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response)
        return data.tag_name.replace(/^v/, "")
      }, Effect.orDie),
      upgrade: Effect.fn("Installation.upgrade")(function* (method: Method, target: string) {
        if (method !== "curl")
          return yield* new UpgradeFailedError({
            stderr: "PrivacyCode updates use the install script: https://getprivacycode.com/install.sh",
          })
        const outcome = yield* upgradeCurl(target)
        if (outcome.code !== 0) return yield* new UpgradeFailedError({ stderr: upgradeFailure(outcome) })
        yield* Effect.logInfo("upgraded", {
          method,
          target,
          stdout: outcome.stdout,
          stderr: outcome.stderr,
        })
        yield* text([process.execPath, "--version"])
      }),
      upgradeMajor: Effect.fn("Installation.upgradeMajor")(function* (method: Method) {
        const target = yield* result.latest(method)
        yield* result.upgrade(method, target)
        yield* Effect.logInfo("upgraded major", { method, target })
      }),
    }

    return Service.of(result)
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [httpClient, AppProcess.node] })

const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))
export const upgradeMajor = (...args: Parameters<Interface["upgradeMajor"]>) =>
  runPromise((s) => s.upgradeMajor(...args))

export * as Installation from "."

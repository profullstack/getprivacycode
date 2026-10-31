import { describe, expect, test } from "bun:test"
import { makeGlobalNode } from "@privacycode-ai/core/effect/app-node"
import { LayerNode } from "@privacycode-ai/core/effect/layer-node"
import { httpClient } from "@privacycode-ai/core/effect/app-node-platform"
import { Effect, Exit, Layer, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Installation } from "../../src/installation"
import { CrossSpawnSpawner } from "@privacycode-ai/core/cross-spawn-spawner"
import { testEffect } from "../lib/effect"

const encoder = new TextEncoder()
const latestUrl = "https://api.github.com/repos/profullstack/getprivacycode/releases/latest"
const installerUrl = "https://getprivacycode.com/install.sh"

function mockHttpClient(handler: (request: HttpClientRequest.HttpClientRequest) => Response | undefined) {
  const client = HttpClient.make((request) => {
    const response = handler(request)
    return response ? Effect.succeed(HttpClientResponse.fromWeb(request, response)) : Effect.never
  })
  return Layer.succeed(HttpClient.HttpClient, client)
}

function mockSpawner(
  handler: (cmd: string, args: readonly string[]) => string | { code: number; stdout?: string; stderr?: string } = () =>
    "",
) {
  const spawner = ChildProcessSpawner.make((command) => {
    const std = ChildProcess.isStandardCommand(command) ? command : undefined
    const result = handler(std?.command ?? "", std?.args ?? [])
    const output = typeof result === "string" ? { code: 0, stdout: result, stderr: "" } : result
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(output.code)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: { [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") } as any,
        stdout: output.stdout ? Stream.make(encoder.encode(output.stdout)) : Stream.empty,
        stderr: output.stderr ? Stream.make(encoder.encode(output.stderr)) : Stream.empty,
        all: Stream.empty,
        getInputFd: () => ({ [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") }) as any,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    )
  })
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function testLayer(
  httpHandler: (request: HttpClientRequest.HttpClientRequest) => Response | undefined,
  spawnHandler?: (cmd: string, args: readonly string[]) => string | { code: number; stdout?: string; stderr?: string },
) {
  const spawnerNode = makeGlobalNode({
    service: ChildProcessSpawner.ChildProcessSpawner,
    layer: mockSpawner(spawnHandler),
    deps: [],
  })
  return LayerNode.compile(Installation.node, [
    [httpClient, mockHttpClient(httpHandler)],
    [CrossSpawnSpawner.node, spawnerNode],
  ])
}

describe("installation", () => {
  test("only treats newer releases in the installed major as regular updates", () => {
    expect(Installation.isUpdate("1.19.0", "1.19.1")).toBe(true)
    expect(Installation.isUpdate("1.19.0", "1.20.0")).toBe(true)
    expect(Installation.isUpdate("1.19.0", "1.19.0")).toBe(false)
    expect(Installation.isUpdate("1.19.0", "1.18.35")).toBe(false)
    expect(Installation.isUpdate("1.19.0", "2.0.0")).toBe(false)
    expect(Installation.isUpdate("local", "1.19.0")).toBe(true)
    expect(Installation.isUpdate("1.19.0", "not-a-version")).toBe(false)
  })

  test("classifies release bumps", () => {
    expect(Installation.getReleaseType("1.19.0", "1.19.1")).toBe("patch")
    expect(Installation.getReleaseType("1.19.0", "1.20.0")).toBe("minor")
    expect(Installation.getReleaseType("1.19.0", "2.0.0")).toBe("major")
  })

  testEffect(testLayer((request) => (request.url === latestUrl ? jsonResponse({ tag_name: "v1.19.5" }) : undefined))).effect(
    "checks PrivacyCode's latest GitHub release",
    () =>
      Effect.gen(function* () {
        expect(yield* Installation.use.latest("curl")).toBe("1.19.5")
      }),
  )

  testEffect(testLayer(() => new Response("unavailable", { status: 503 }))).effect(
    "fails when the release API is unavailable",
    () =>
      Effect.gen(function* () {
        expect(Exit.isFailure(yield* Installation.use.latest("curl").pipe(Effect.exit))).toBe(true)
      }),
  )

  testEffect(
    testLayer(
      (request) => (request.url === installerUrl ? new Response("installer", { status: 200 }) : undefined),
      (cmd, args) => {
        if (cmd === "bash" && args[0] === "--version") return "GNU bash"
        if (cmd === "bash") return "installed"
        return ""
      },
    ),
  ).effect("upgrades through the PrivacyCode installer", () =>
    Effect.gen(function* () {
      yield* Installation.use.upgrade("curl", "1.19.5")
    }),
  )

  testEffect(
    testLayer(
      (request) => (request.url === installerUrl ? new Response("installer", { status: 200 }) : undefined),
      (cmd, args) => {
        if (cmd === "bash" && args[0] === "--version") return "GNU bash"
        if (cmd === "bash") return { code: 1, stderr: "script output with token=secret" }
        return ""
      },
    ),
  ).effect("sanitizes installer failures", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Installation.use.upgrade("curl", "1.19.5"))
      expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
      expect(error.stderr).toBe("Upgrade failed (exit code 1).")
      expect(error.stderr).not.toContain("secret")
    }),
  )

  testEffect(testLayer(() => undefined)).effect("does not try upstream package managers", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Installation.use.upgrade("npm", "1.19.5"))
      expect(error.stderr).toContain(installerUrl)
    }),
  )

  testEffect(
    testLayer((request) => {
      if (request.url === latestUrl) return jsonResponse({ tag_name: "v2.0.0" })
      if (request.url === installerUrl) return new Response("installer", { status: 200 })
      return undefined
    }, (cmd, args) => (cmd === "bash" && args[0] === "--version" ? "GNU bash" : "")),
  ).effect("installs a PrivacyCode major release with the same installer", () =>
    Effect.gen(function* () {
      yield* Installation.use.upgradeMajor("curl")
    }),
  )
})

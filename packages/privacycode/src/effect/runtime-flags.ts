import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("PRIVACYCODE_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@privacycode/RuntimeFlags", {
  autoShare: bool("PRIVACYCODE_AUTO_SHARE"),
  pure: bool("PRIVACYCODE_PURE"),
  disableDefaultPlugins: bool("PRIVACYCODE_DISABLE_DEFAULT_PLUGINS"),
  disableEmbeddedWebUi: bool("PRIVACYCODE_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("PRIVACYCODE_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("PRIVACYCODE_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("PRIVACYCODE_DISABLE_CLAUDE_CODE"),
    direct: bool("PRIVACYCODE_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("PRIVACYCODE_DISABLE_CLAUDE_CODE"),
    direct: bool("PRIVACYCODE_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("PRIVACYCODE_ENABLE_EXA"),
    legacy: bool("PRIVACYCODE_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("PRIVACYCODE_ENABLE_PARALLEL"),
    legacy: bool("PRIVACYCODE_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("PRIVACYCODE_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("PRIVACYCODE_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("PRIVACYCODE_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: enabledByExperimental("PRIVACYCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("PRIVACYCODE_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("PRIVACYCODE_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("PRIVACYCODE_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("PRIVACYCODE_EXPERIMENTAL_PLAN_MODE"),
  experimentalCodeMode: enabledByExperimental("PRIVACYCODE_EXPERIMENTAL_CODE_MODE"),
  experimentalEventSystem: enabledByExperimental("PRIVACYCODE_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("PRIVACYCODE_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("PRIVACYCODE_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("PRIVACYCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("PRIVACYCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("PRIVACYCODE_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("PRIVACYCODE_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("PRIVACYCODE_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const node = LayerNode.make({ service: Service, layer: Service.layer.pipe(Layer.orDie), deps: [] })

export * as RuntimeFlags from "./runtime-flags"
import { LayerNode } from "@privacycode-ai/core/effect/layer-node"

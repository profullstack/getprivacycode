import { run as runTui, type TuiInput } from "@privacycode-ai/tui"
import { Global } from "@privacycode-ai/core/global"
import { AppNodeBuilder } from "@privacycode-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}

import type { Provider } from "./models-dev"

/**
 * c0mpute (https://c0mpute.com): open models on the Infernet peer network,
 * reached through its OpenAI-compatible endpoint. Offered as one more provider
 * the user can pick, never as a default: it only turns on when the user sets
 * C0MPUTE_API_KEY or logs in to it. Prompts (and so your code) are served by
 * independent peer nodes, which is why it stays opt-in in a privacy-first tool.
 *
 * models.dev does not list it, so it is merged into whatever catalog loads. A
 * catalog that does list `c0mpute` wins.
 */
const model = (id: string, name: string, context: number, output: number): Provider["models"][string] => ({
  id,
  name,
  release_date: "2026-11-01",
  attachment: false,
  reasoning: false,
  temperature: true,
  // The endpoint has no tool calling; the agent's tools need a provider that does.
  tool_call: false,
  cost: { input: 0, output: 0 },
  limit: { context, output },
  modalities: { input: ["text"], output: ["text"] },
})

export const C0MPUTE_PROVIDER: Provider = {
  id: "c0mpute",
  name: "c0mpute (peer network)",
  env: ["C0MPUTE_API_KEY"],
  npm: "@ai-sdk/openai-compatible",
  api: "https://infernetprotocol.com/v1",
  models: {
    "huihui_ai/qwen3.5-abliterated:9b": model("huihui_ai/qwen3.5-abliterated:9b", "Qwen 3.5 9B (house model)", 32768, 8192),
    "qwen2.5:7b": model("qwen2.5:7b", "Qwen 2.5 7B", 32768, 8192),
    "qwen3:4b": model("qwen3:4b", "Qwen 3 4B", 32768, 8192),
    "gemma3:4b": model("gemma3:4b", "Gemma 3 4B", 32768, 8192),
  },
}

/** The catalog with c0mpute added, unless it already has one. */
export function withC0mpute(catalog: Record<string, Provider>): Record<string, Provider> {
  if (catalog[C0MPUTE_PROVIDER.id]) return catalog
  return { ...catalog, [C0MPUTE_PROVIDER.id]: C0MPUTE_PROVIDER }
}

<p align="center">
  <img src="https://img.shields.io/badge/privacy-first-62ff94?style=flat-square" />
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/165%2B-providers-62ff94?style=flat-square" />
</p>

# PrivacyCode

**Privacy-first AI coding agent for enterprise.** Your data never leaves your machine unprotected. Defender&trade; tokenizes PII and secrets before any cloud AI sees them.

```bash
curl -fsSL https://getprivacycode.com/install | bash
```

## Why PrivacyCode?

AI coding tools send your code, prompts, and context to cloud providers. But your codebase contains secrets — API keys, customer emails, credentials, internal URLs. PrivacyCode is **the only coding agent** that tokenizes sensitive data before it leaves your machine. The AI provider sees synthetic placeholders. You see real values. No other tool does this.

### Defender&trade; — the privacy layer

| Scenario | Without PrivacyCode | With PrivacyCode |
|----------|-------------------|-------------------|
| You type: `Fix auth for jane@acme.com with key sk-live-51HdF...` | Provider sees your real email and Stripe key | Provider sees `[EMAI-...]` and `[KEY-...]` |
| Agent reads `config.ts` containing `DATABASE_URL=postgres://...` | Provider sees your DB credentials | Provider sees `[URLP-...]` |
| Agent runs `git log` and output contains commit emails | Provider sees every contributor email | Provider sees anonymized tokens |

**18 detection patterns** by default: emails, phones, SSNs, credit cards, IPs, IBANs, API keys, JWT tokens, AWS keys, GitHub tokens, OpenAI keys, passwords in URLs, passport numbers, and more. Add custom regex patterns for your organization.

## Quick Start

```bash
# Install
curl -fsSL https://getprivacycode.com/install | bash

# Or via npm
npm install -g privacycode

# Set your API key
export OPENAI_API_KEY=sk-...

# Start coding
privacycode
```

Defender is **on by default**. No configuration needed.

## Features

- **165+ AI providers** — OpenAI, Anthropic, Gemini, Groq, DeepSeek, Ollama, and more. Bring your own keys.
- **Interactive TUI** — Terminal-native experience with streaming responses, diff previews, and approval-gated execution.
- **Agentic loop** — Read, write, edit, search, and run commands with your explicit approval.
- **Zero telemetry** — No servers. No analytics. No crash reporting. Every line is open source.
- **Air-gapped ready** — Works offline with local models. Bundled provider registry.
- **Open source** — MIT license. Fork, audit, and ship on your terms.

## Providers

PrivacyCode connects to any OpenAI-compatible provider. Set your preferred provider:

```bash
export PRIVACYCODE_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-...

export PRIVACYCODE_PROVIDER=deepseek
export DEEPSEEK_API_KEY=sk-...
```

List all 165+ supported providers:

```bash
privacycode providers
privacycode models anthropic
```

## Commands

| Command | Description |
|---------|-------------|
| `privacycode` | Launch interactive TUI (default) |
| `privacycode run "<task>"` | One-shot non-interactive task |
| `privacycode providers` | List all supported providers |
| `privacycode models [id]` | List models for a provider |
| `privacycode analyze <text>` | Show what Defender would tokenize |

## Slash Commands (in TUI)

| Command | Action |
|---------|--------|
| `/privacy on\|off` | Toggle Defender tokenization |
| `/model <id>` | Switch AI model |
| `/provider <id>` | Switch AI provider |
| `/vault` | Show vault statistics |
| `/stats` | Show token usage |
| `/clear` | Clear conversation history |
| `/exit` | Quit |

## Configuration

Resolved in order: CLI flags → environment variables → project config → global config.

```jsonc
// ~/.config/privacycode/config.json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514"
}
```

```jsonc
// ./privacycode.jsonc (project-level)
{
  "provider": "openai",
  "model": "gpt-4o"
}
```

## Enterprise

- **No data leaves your network** — all tokenization happens locally
- **Self-hosted provider registry** — no dependency on external services
- **Air-gapped deployment** — works entirely offline with local models
- **Custom PII patterns** — add organization-specific regex
- **Compliance ready** — SOC 2, HIPAA, PCI-DSS supportable architecture

## Development

```bash
bun install
bun dev     # from packages/privacycode
```

## License

MIT

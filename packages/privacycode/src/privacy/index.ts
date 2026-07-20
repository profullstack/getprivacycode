import { MemoryVault } from "./vault"
import { tokenize, detokenize, TOKEN_REGEX, detectSensitiveData } from "./detector"

const PARTIAL_TOKEN_TAIL = /\[\w*-?[A-Fa-f0-9]*$/

export interface StreamDetokenizer {
  push(chunk: string): string
  flush(): string
}

export class PrivacyGuard {
  private vault: MemoryVault
  enabled: boolean
  stats = { valuesProtected: 0, vaultSize: 0 }

  constructor(opts: { enabled?: boolean } = {}) {
    this.vault = new MemoryVault()
    this.enabled = opts.enabled ?? true
  }

  static _instance: PrivacyGuard | undefined

  static get(): PrivacyGuard {
    if (!PrivacyGuard._instance) {
      PrivacyGuard._instance = new PrivacyGuard()
    }
    return PrivacyGuard._instance
  }

  tokenizeOutbound(text: string): string {
    if (!this.enabled || !text) return text
    const { tokenized, mapping } = tokenize(text, this.vault)
    this.stats.valuesProtected += Object.keys(mapping).length
    this.stats.vaultSize = this.vault.size()
    return tokenized
  }

  detokenizeInbound(text: string): string {
    if (!text) return text
    return detokenize(text, this.vault)
  }

  detokenizeObject(obj: unknown): unknown {
    if (typeof obj === "string") return this.detokenizeInbound(obj)
    if (Array.isArray(obj)) return obj.map((v) => this.detokenizeObject(v))
    if (obj && typeof obj === "object") {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(obj)) {
        out[k] = this.detokenizeObject(v)
      }
      return out
    }
    return obj
  }

  /**
   * Tokenize string fields in an AI SDK ModelMessage-like object
   * before it is sent to the provider. Mutates a shallow copy.
   */
  tokenizeMessage(msg: any): any {
    if (!this.enabled) return msg
    const copy: any = {}
    for (const key of Object.keys(msg)) {
      const val = msg[key]
      if (key === "content" && typeof val === "string") {
        copy[key] = this.tokenizeOutbound(val)
      } else if (key === "content" && Array.isArray(val)) {
        copy[key] = val.map((part: any) => {
          if (!part || typeof part !== "object") return part
          if (part.type === "text" && typeof part.text === "string") {
            return { ...part, text: this.tokenizeOutbound(part.text) }
          }
          if (part.type?.startsWith("tool-") && typeof part.output === "string") {
            return { ...part, output: this.tokenizeOutbound(part.output) }
          }
          return part
        })
      } else {
        copy[key] = val
      }
    }
    return copy
  }

  tokenizeMessages(msgs: any[]): any[] {
    if (!this.enabled) return msgs
    return msgs.map((m) => this.tokenizeMessage(m))
  }

  /**
   * Create a stateful detokenizer for safe streaming detokenization.
   * Tokens matching TOKEN_REGEX can span chunk boundaries, so partial
   * matches are held until completed or flushed.
   */
  createStreamDetokenizer(): StreamDetokenizer {
    let buffer = ""

    const drain = (isFinal: boolean) => {
      let out = ""
      let lastIndex = 0
      const re = new RegExp(TOKEN_REGEX.source, TOKEN_REGEX.flags)
      let match: RegExpExecArray | null
      while ((match = re.exec(buffer)) !== null) {
        out += buffer.slice(lastIndex, match.index)
        const original = this.vault.retrieve(match[0])
        out += original !== null && original !== undefined ? original : match[0]
        lastIndex = match.index + match[0].length
      }
      let rest = buffer.slice(lastIndex)
      if (!isFinal) {
        const partial = rest.match(PARTIAL_TOKEN_TAIL)
        if (partial) {
          buffer = partial[0]
          rest = rest.slice(0, rest.length - partial[0].length)
        } else {
          buffer = ""
        }
      } else {
        buffer = ""
      }
      return out + rest
    }

    return {
      push: (chunk: string) => {
        if (!chunk) return ""
        buffer += chunk
        return drain(false)
      },
      flush: () => drain(true),
    }
  }

  /** Detect sensitive data in text (for reporting) */
  analyze(text: string) {
    return detectSensitiveData(text)
  }

  vaultSize(): number {
    return this.vault.size()
  }
}

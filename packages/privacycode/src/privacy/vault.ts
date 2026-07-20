import crypto from "crypto"

function generateToken(prefix: string) {
  const random = crypto.randomBytes(8).toString("hex").toUpperCase()
  return `[${prefix}-${random}]`
}

export interface VaultEntry {
  token: string
  value: string
  type: string
  createdAt: number
}

export class MemoryVault {
  private data = new Map<string, { value: string; type: string; createdAt: number }>()
  private reverse = new Map<string, string>()

  store(value: string, type: string): string {
    const existing = this.reverse.get(value)
    if (existing) return existing

    const prefix = type.toUpperCase().slice(0, 4)
    const token = generateToken(prefix)

    this.data.set(token, { value, type, createdAt: Date.now() })
    this.reverse.set(value, token)
    return token
  }

  retrieve(token: string): string | null {
    const entry = this.data.get(token)
    return entry ? entry.value : null
  }

  has(value: string): boolean {
    return this.reverse.has(value)
  }

  size(): number {
    return this.data.size
  }

  entries(): VaultEntry[] {
    return Array.from(this.data.entries()).map(([token, entry]) => ({
      token,
      ...entry,
    }))
  }

  clear() {
    this.data.clear()
    this.reverse.clear()
  }
}

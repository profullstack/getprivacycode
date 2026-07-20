import type { MemoryVault } from "./vault"

interface Pattern {
  regex: RegExp
  type: string
  prefix: string
}

const PATTERNS: Record<string, Pattern> = {
  creditCard: {
    regex: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    type: "creditCard",
    prefix: "CARD",
  },
  email: {
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    type: "email",
    prefix: "EMAI",
  },
  phone: {
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    type: "phone",
    prefix: "PHON",
  },
  ssn: {
    regex: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
    type: "ssn",
    prefix: "SSN",
  },
  ipAddress: {
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    type: "ipAddress",
    prefix: "IPAD",
  },
  iban: {
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    type: "iban",
    prefix: "IBAN",
  },
  passport: {
    regex: /\b[A-Z]\d{8}\b/g,
    type: "passport",
    prefix: "PASS",
  },
  apiKey: {
    regex: /\b(?:sk|pk|api[_-]?key|token|secret)[_-]?[A-Za-z0-9]{20,}\b/gi,
    type: "apiKey",
    prefix: "KEY",
  },
  jwtToken: {
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g,
    type: "jwtToken",
    prefix: "JWT",
  },
  passwordInUrl: {
    regex: /(?<=:\/\/)[^:\s]+:[^@\s]+(?=@)/g,
    type: "passwordInUrl",
    prefix: "URLP",
  },
  awsAccessKey: {
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    type: "awsAccessKey",
    prefix: "AWSA",
  },
  githubToken: {
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g,
    type: "githubToken",
    prefix: "GHTO",
  },
  openaiKey: {
    regex: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}\b/g,
    type: "openaiKey",
    prefix: "OAIK",
  },
}

interface Detection {
  value: string
  type: string
  prefix: string
  start: number
  end: number
}

function collectMatches(text: string, regexp: RegExp, pattern: Pattern): Detection[] {
  const results: Detection[] = []
  const matches = text.matchAll(regexp)
  for (const match of matches) {
    results.push({
      value: match[0],
      type: pattern.type,
      prefix: pattern.prefix,
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return results
}

export function detectSensitiveData(text: string): Detection[] {
  const detections: Detection[] = []

  for (const [_name, pattern] of Object.entries(PATTERNS)) {
    const results = collectMatches(text, pattern.regex, pattern)
    detections.push(...results)
  }

  detections.sort((a, b) => a.start - b.start)

  const unique = new Map<string, Detection>()
  for (const d of detections) {
    const key = `${d.start}:${d.end}:${d.type}`
    if (!unique.has(key)) unique.set(key, d)
  }
  return Array.from(unique.values())
}

function filterNonOverlapping(detections: Detection[]): Detection[] {
  if (detections.length === 0) return []
  detections.sort((a, b) => a.start - b.start)
  const result = [detections[0]]

  for (let i = 1; i < detections.length; i++) {
    const current = detections[i]
    const last = result[result.length - 1]
    if (current.start >= last.end) result.push(current)
  }
  return result
}

export function tokenize(
  text: string,
  vault: MemoryVault,
): { tokenized: string; mapping: Record<string, string> } {
  const allDetections = detectSensitiveData(text)

  if (allDetections.length === 0) {
    return { tokenized: text, mapping: {} }
  }

  const detections = filterNonOverlapping(allDetections)

  let tokenized = text
  const mapping: Record<string, string> = {}
  let offset = 0

  for (const detection of detections) {
    const token = vault.store(detection.value, detection.type)
    mapping[token] = detection.value

    const adjustedStart = detection.start + offset
    const adjustedEnd = detection.end + offset
    const tokenLen = token.length

    tokenized = tokenized.slice(0, adjustedStart) + token + tokenized.slice(adjustedEnd)
    offset += tokenLen - (detection.end - detection.start)
  }

  return { tokenized, mapping }
}

export const TOKEN_REGEX = /\[(\w+)-([A-Fa-f0-9]{16})\]/g

export function detokenize(text: string, vault: MemoryVault): string {
  if (!text || text.length === 0) return text
  let result = text
  let match: RegExpExecArray | null
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const token = match[0]
    const original = vault.retrieve(token)
    if (original) result = result.replace(token, original)
  }
  return result
}

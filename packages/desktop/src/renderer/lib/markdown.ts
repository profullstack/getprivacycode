function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
}

interface CodeBlock {
  lang: string
  code: string
  start: number
  end: number
}

function findCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const regex = /```(\w*)\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      lang: match[1] || "",
      code: match[2].trim(),
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return blocks
}

export function renderMarkdown(text: string): string {
  if (!text) return ""

  const codeBlocks = findCodeBlocks(text)
  if (codeBlocks.length === 0) {
    return text
      .split("\n\n")
      .filter((p) => p.trim())
      .map((p) => `<p>${renderInline(p)}</p>`)
      .join("")
  }

  const parts: string[] = []
  let lastEnd = 0

  for (const block of codeBlocks) {
    const before = text.slice(lastEnd, block.start)
    if (before.trim()) {
      parts.push(
        before
          .split("\n\n")
          .filter((p) => p.trim())
          .map((p) => `<p>${renderInline(p)}</p>`)
          .join(""),
      )
    }

    const langLabel = block.lang ? `<span class="code-lang">${escapeHtml(block.lang)}</span>` : ""
    parts.push(
      `<div class="code-block">${langLabel}<pre><code>${escapeHtml(block.code)}</code></pre></div>`,
    )
    lastEnd = block.end
  }

  const after = text.slice(lastEnd)
  if (after.trim()) {
    parts.push(
      after
        .split("\n\n")
        .filter((p) => p.trim())
        .map((p) => `<p>${renderInline(p)}</p>`)
        .join(""),
    )
  }

  return parts.join("")
}

export function renderMarkdownStreaming(text: string): string {
  const codeBlocks = findCodeBlocks(text)
  if (codeBlocks.length === 0) {
    return renderInline(text)
  }

  const last = codeBlocks[codeBlocks.length - 1]
  const isIncomplete = !text.endsWith("```") && !text.slice(last.end).includes("```")

  let result = ""
  let lastEnd = 0

  for (const block of codeBlocks.slice(0, isIncomplete ? -1 : undefined)) {
    const before = text.slice(lastEnd, block.start)
    if (before.trim()) {
      result += `<p>${renderInline(before)}</p>`
    }
    const label = block.lang ? `<span class="code-lang">${escapeHtml(block.lang)}</span>` : ""
    result += `<div class="code-block">${label}<pre><code>${escapeHtml(block.code)}</code></pre></div>`
    lastEnd = block.end
  }

  if (isIncomplete && codeBlocks.length > 0) {
    const incomplete = codeBlocks[codeBlocks.length - 1]
    const label = incomplete.lang ? `<span class="code-lang">${escapeHtml(incomplete.lang)}</span>` : ""
    result += `<div class="code-block">${label}<pre><code>${escapeHtml(incomplete.code)}</code></pre></div>`
    return result
  }

  const after = text.slice(lastEnd)
  if (after.trim()) {
    result += `<p>${renderInline(after)}</p>`
  }

  return result
}

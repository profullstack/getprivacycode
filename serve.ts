/**
 * Minimal zero-dependency static server for the getprivacycode.com marketing site.
 * Serves the pre-built export in ./site with clean-URL fallback (/cli -> cli.html).
 */
import { file } from "bun"
import { join, normalize, extname } from "node:path"

const ROOT = join(import.meta.dir, "site")
const PORT = Number(process.env.PORT ?? 3000)

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
}

// Resolve a request pathname to a file inside ROOT, guarding against traversal.
async function resolve(pathname: string): Promise<string | null> {
  // Strip query/hash already handled by URL. Decode + normalize.
  let p = decodeURIComponent(pathname)
  if (p.endsWith("/")) p += "index.html"
  const safe = normalize(p).replace(/^(\.\.[/\\])+/, "")
  const base = join(ROOT, safe)
  if (!base.startsWith(ROOT)) return null

  const candidates = extname(base)
    ? [base]
    : [base, `${base}.html`, join(base, "index.html")]

  for (const c of candidates) {
    if (await file(c).exists()) return c
  }
  return null
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const { pathname } = new URL(req.url)
    const match = (await resolve(pathname)) ?? (await resolve("/404.html"))
    if (!match) return new Response("Not Found", { status: 404 })

    const ext = extname(match)
    const headers: Record<string, string> = {
      "content-type": MIME[ext] ?? "application/octet-stream",
    }
    // Fingerprinted Next.js assets are safe to cache forever; HTML stays fresh.
    if (pathname.startsWith("/_next/") || ext === ".woff2" || ext === ".woff") {
      headers["cache-control"] = "public, max-age=31536000, immutable"
    } else {
      headers["cache-control"] = "public, max-age=0, must-revalidate"
    }
    return new Response(file(match), {
      status: pathname === "/404.html" ? 404 : 200,
      headers,
    })
  },
})

console.log(`getprivacycode.com static site serving ./site on :${PORT}`)

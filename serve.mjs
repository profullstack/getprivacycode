/**
 * Minimal zero-dependency Node static server for the getprivacycode.com
 * marketing site. Serves the pre-built export in ./site with clean-URL
 * fallback (/cli -> cli.html).
 */
import { createServer } from "node:http"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join, normalize, extname } from "node:path"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "site")
const PORT = Number(process.env.PORT ?? 3000)

const MIME = {
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

async function exists(p) {
  try {
    const s = await stat(p)
    return s.isFile()
  } catch {
    return false
  }
}

// Resolve a request pathname to a file inside ROOT, guarding against traversal.
async function resolve(pathname) {
  let p = decodeURIComponent(pathname)
  if (p.endsWith("/")) p += "index.html"
  const safe = normalize(p).replace(/^(\.\.[/\\])+/, "")
  const base = join(ROOT, safe)
  if (!base.startsWith(ROOT)) return null

  const candidates = extname(base) ? [base] : [base, `${base}.html`, join(base, "index.html")]
  for (const c of candidates) {
    if (await exists(c)) return c
  }
  return null
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost")
    const match = (await resolve(pathname)) ?? (await resolve("/404.html"))
    if (!match) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
      res.end("Not Found")
      return
    }

    const ext = extname(match)
    const headers = { "content-type": MIME[ext] ?? "application/octet-stream" }
    // Fingerprinted Next.js assets are safe to cache forever; HTML stays fresh.
    if (pathname.startsWith("/_next/") || ext === ".woff2" || ext === ".woff") {
      headers["cache-control"] = "public, max-age=31536000, immutable"
    } else {
      headers["cache-control"] = "public, max-age=0, must-revalidate"
    }
    res.writeHead(pathname === "/404.html" ? 404 : 200, headers)
    createReadStream(match).pipe(res)
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    res.end("Internal Server Error")
    console.error(err)
  }
})

server.listen(PORT, "0.0.0.0", () => {
  console.log(`getprivacycode.com static site serving ./site on :${PORT}`)
})

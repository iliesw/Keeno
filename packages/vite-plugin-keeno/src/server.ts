// `@inflector/vite-plugin-keeno/server`: serve a `renderStrategy: 'ssr'` build in production.
// No Vite at runtime: this reads `dist/client` (the built assets and the index.html template) and
// renders pages with the server bundle in `dist/server`.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** What `virtual:keeno-server` exports. */
export interface ServerEntry {
  render(url: string, options?: { stream?: boolean }): Promise<RenderResult>
  routes: { path: string }[]
}

export interface RenderResult {
  /** The page HTML (with `stream`, the stream instead: it resolves once the first chunk is ready). */
  html?: string
  stream?: ReadableStream<string>
  /** The `<Head>` tags. */
  head: string
  /** 200, or the status of the error page that rendered. */
  status: number
}

// ---------------------------------------------------------------------------
// The HTML template

const APP = /(<div\s+id=["']app["'][^>]*>)([\s\S]*?)(<\/div>)/

/** Split index.html around the app container: [before content, after content]. */
export function splitTemplate(template: string): [string, string] {
  const m = APP.exec(template)
  if (!m) throw new Error('[keeno] index.html needs an app container: <div id="app"></div>')
  const start = m.index + m[1].length
  return [template.slice(0, start), template.slice(start + m[2].length)]
}

/** Add `head` (the `<Head>` tags) before `</head>`; they replace the template's own `<title>`. */
export function withHead(html: string, head: string): string {
  if (!head) return html
  if (/<title[\s>]/.test(head)) html = html.replace(/<title[\s>][\s\S]*?<\/title>\s*/, '')
  return html.replace(/<\/head>/i, `${head}\n</head>`)
}

/** A page without islands needs no JavaScript: drop the module scripts and their preloads. */
export function withoutScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*type=["']module["'][^>]*>[\s\S]*?<\/script>\s*/gi, '')
    .replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>\s*/gi, '')
}

/** `<link>`s for the built stylesheets the template doesn't link yet (components' scoped CSS). */
export function stylesheetLinks(clientDir: string, template: string, base = '/'): string {
  const out: string[] = []
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.css')) {
        const href = base + path.relative(clientDir, full).replace(/\\/g, '/')
        if (!template.includes(href)) out.push(`<link rel="stylesheet" href="${href}">`)
      }
    }
  }
  walk(path.join(clientDir, 'assets'))
  return out.join('\n')
}

/** A whole page from the template and a non-streamed render. */
export function page(template: string, html: string, head: string, islands: boolean): string {
  const [before, after] = splitTemplate(template)
  const out = withHead(before, head) + html + after
  return islands && !html.includes('<kn-island') ? withoutScripts(out) : out
}

// ---------------------------------------------------------------------------
// Production request handler

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
}

export interface HandlerOptions {
  /** The build output directory, with `client/` and `server/` inside (default `dist`). */
  dist?: string
  /** The public base path the app is served under (default `/`). */
  base?: string
}

export interface KeenoHandler {
  /** Node / Connect / Express middleware. Calls `next` (if given) for requests it doesn't serve. */
  (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void): Promise<void>
  /** A fetch handler (Bun.serve, Deno, Workers-style runtimes with a filesystem). */
  fetch(request: Request): Promise<Response>
}

/**
 * Serve a `renderStrategy: 'ssr'` build: static files from `dist/client`, and every other GET
 * rendered (and streamed) by the server bundle.
 *
 * ```ts
 * import { createServer } from 'node:http'
 * import { createHandler } from '@inflector/vite-plugin-keeno/server'
 * createServer(createHandler()).listen(3000)
 * // or: Bun.serve({ fetch: createHandler().fetch })
 * ```
 */
export function createHandler(options: HandlerOptions = {}): KeenoHandler {
  const dist = path.resolve(options.dist ?? 'dist')
  const clientDir = path.join(dist, 'client')
  const base = options.base ?? '/'
  const template = readFileSync(path.join(clientDir, 'index.html'), 'utf8')
  const links = stylesheetLinks(clientDir, template, base)
  const prepared = links ? template.replace(/<\/head>/i, `${links}\n</head>`) : template
  let entry: Promise<ServerEntry> | undefined
  const load = () => (entry ??= import(pathToFileURL(path.join(dist, 'server', 'entry-server.js')).href))

  /** A file in dist/client for this path, if there is one (never index.html: that's the template). */
  const file = (pathname: string): string | null => {
    if (!pathname.startsWith(base)) return null
    let rel: string
    try {
      rel = decodeURIComponent(pathname.slice(base.length))
    } catch {
      return null
    }
    if (!rel || rel === 'index.html') return null
    const full = path.join(clientDir, rel)
    if (!full.startsWith(clientDir + path.sep)) return null
    return existsSync(full) && statSync(full).isFile() ? full : null
  }

  const respond = async (url: string, method: string): Promise<Response | null> => {
    const { pathname } = new URL(url, 'http://localhost')
    const found = file(pathname)
    if (found) {
      const type = TYPES[path.extname(found).toLowerCase()] ?? 'application/octet-stream'
      const headers: Record<string, string> = { 'content-type': type }
      if (pathname.startsWith(base + 'assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable'
      return new Response(method === 'HEAD' ? null : readFileSync(found), { headers })
    }
    if (method !== 'GET' && method !== 'HEAD') return null
    const { render } = await load()
    const { stream, head, status } = await render(url, { stream: true })
    const [before, after] = splitTemplate(prepared)
    const encoder = new TextEncoder()
    const reader = stream!.getReader()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(withHead(before, head)))
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          controller.enqueue(encoder.encode(value))
        }
        controller.enqueue(encoder.encode(after))
        controller.close()
      },
      cancel() {
        void reader.cancel()
      },
    })
    return new Response(method === 'HEAD' ? null : body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
  }

  const handler = (async (req, res, next) => {
    try {
      const response = await respond(req.url ?? '/', req.method ?? 'GET')
      if (!response) return next ? next() : void res.writeHead(405).end()
      res.writeHead(response.status, Object.fromEntries(response.headers))
      if (!response.body) return void res.end()
      const reader = response.body.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    } catch (err) {
      if (next) return next(err)
      console.error(err)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  }) as KeenoHandler
  handler.fetch = async (request) => (await respond(request.url, request.method)) ?? new Response(null, { status: 405 })
  return handler
}

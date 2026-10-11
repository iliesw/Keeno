// SSR server for the docs site. `bun server.ts` runs Vite in middleware mode with hot reload;
// `bun server.ts --prod` serves the build from dist/ and renders each request with the server bundle.
import { existsSync, readFileSync, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ViteDevServer } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const prod = process.argv.includes('--prod')
const portArg = process.argv.indexOf('--port')
const port = Number(portArg > 0 ? process.argv[portArg + 1] : process.env.PORT ?? 5177)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

type Render = (url: string) => Promise<{ html: string; head: string; status: number }>


const clientDir = path.join(root, 'dist/client')
const prodTemplate = prod ? readFileSync(path.join(root, 'dist/server/template.html'), 'utf8') : ''
const prodRender: Render | undefined = prod
  ? (await import(pathToFileURL(path.join(root, 'dist/server/entry-server.js')).href)).render
  : undefined

/** Serve a file from dist/client (prod), other than the prerendered HTML: pages are rendered live. */
function serveStatic(url: string, res: http.ServerResponse): boolean {
  const file = path.join(clientDir, decodeURIComponent(url.split('?')[0]))
  if (!file.startsWith(clientDir) || file.endsWith('.html') || !existsSync(file) || !statSync(file).isFile()) return false
  const immutable = file.includes(`${path.sep}assets${path.sep}`)
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  })
  res.end(readFileSync(file))
  return true
}

async function renderPage(url: string, res: http.ServerResponse) {
  try {
    let template: string
    let render: Render
    if (vite) {
      template = await vite.transformIndexHtml(url, readFileSync(path.join(root, 'index.html'), 'utf8'))
      render = (await vite.ssrLoadModule('/src/entry-server.ts')).render
    } else {
      template = prodTemplate
      render = prodRender!
    }
    const page = await render(url)
    const html = template.replace('<!--app-head-->', page.head).replace('<!--app-html-->', page.html)
    res.writeHead(page.status, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (e) {
    vite?.ssrFixStacktrace(e as Error)
    console.error(e)
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(vite ? String((e as Error).stack) : 'Internal Server Error')
  }
}

let vite: ViteDevServer | undefined
const server = http.createServer((req, res) => {
  const url = req.url ?? '/'
  if (vite) {
    vite.middlewares(req, res, () => renderPage(url, res))
    return
  }
  if (!serveStatic(url, res)) renderPage(url, res)
})

if (!prod) {
  const { createServer } = await import('vite')
  // HMR shares this server's port instead of opening its own WebSocket port.
  vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'custom' })
}

server.listen(port, () => {
  console.log(`Lux docs (${prod ? 'production' : 'dev'} SSR) → http://localhost:${port}`)
})

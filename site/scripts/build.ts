// Production build: client bundle, server bundle, then prerender every page to static HTML
// (dist/client works on any static host; `bun server.ts --prod` renders on each request instead).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = (p: string) => path.join(root, 'dist', p)

await build({ root, logLevel: 'warn', build: { outDir: dist('client'), emptyOutDir: true } })
await build({
  root,
  logLevel: 'warn',
  publicDir: false,
  build: { ssr: 'src/entry-server.ts', outDir: dist('server'), emptyOutDir: true },
})

renameSync(dist('client/index.html'), dist('server/template.html'))
const template = readFileSync(dist('server/template.html'), 'utf8')
const { render, routes } = await import(pathToFileURL(dist('server/entry-server.js')).href)

for (const route of routes() as string[]) {
  const page = await render(route)
  const html = template.replace('<!--app-head-->', page.head).replace('<!--app-html-->', page.html)
  const file = route === '/404' ? dist('client/404.html') : dist(`client${route === '/' ? '' : route}/index.html`)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, html)
}
console.log(`Prerendered ${routes().length} pages to dist/client`)

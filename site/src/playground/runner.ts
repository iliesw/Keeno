// Builds the preview iframe's document from compiled files. The iframe is sandboxed (its own
// opaque origin), so it creates the module blobs itself: imports between playground files are
// rewritten to bare `@pg/` specifiers, which an import map resolves to those blobs, next to the
// Lux runtime. Other bare imports load from esm.sh.
import { lux, router } from 'virtual:lux-runtime'
import type { CompiledFile } from './types'

export const ENTRY = 'App.lx'

const SPECIFIER = /(\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s*(?:[\w*{}\s,$]+\s*from\s*)|\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g

/** `./Card.lx` from `App.lx` → `Card.lx` (playground files are flat, but allow `./x/../`). */
function resolveRelative(spec: string, names: Set<string>): string | null {
  const parts: string[] = []
  for (const p of spec.split('/')) {
    if (p === '.' || p === '') continue
    if (p === '..') parts.pop()
    else parts.push(p)
  }
  const base = parts.join('/')
  for (const candidate of [base, `${base}.lx`, `${base}.ts`, `${base}.js`]) if (names.has(candidate)) return candidate
  return null
}

export interface RunnerOptions {
  dark: boolean
  tailwind: boolean
}

export function buildDocument(files: CompiledFile[], options: RunnerOptions): string {
  const names = new Set(files.map((f) => f.name))
  const modules: Record<string, string> = {}
  const externals = new Set<string>()
  const missing: string[] = []
  for (const f of files) {
    if (f.name.endsWith('.css')) {
      modules[`@pg/${f.name}`] = ''
      continue
    }
    if (!f.js) continue
    modules[`@pg/${f.name}`] = f.js.replace(SPECIFIER, (all, head: string, q: string, spec: string) => {
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const target = resolveRelative(spec, names)
        if (!target) {
          missing.push(`${f.name}: cannot find "${spec}"`)
          return all
        }
        return `${head}${q}@pg/${target}${q}`
      }
      if (!spec.startsWith('@inflector/lux') && !/^(https?:|data:|blob:)/.test(spec)) externals.add(spec)
      return all
    })
  }
  const css = files.map((f) => f.css).filter(Boolean).join('\n')
  const payload = {
    lux,
    router,
    modules,
    externals: [...externals],
    entry: `@pg/${ENTRY}`,
    missing,
  }
  const json = JSON.stringify(payload).replace(/</g, '\\u003c')
  return `<!doctype html>
<html lang="en"${options.dark ? ' class="dark"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${BASE_CSS}</style>
<style id="lux-css">${css.replace(/<\/style/gi, '<\\/style')}</style>
${options.tailwind ? '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>\n<style type="text/tailwindcss">@custom-variant dark (&:where(.dark, .dark *));</style>' : ''}
<script type="application/json" id="lux-payload">${json}</script>
<script>${BOOT}</script>
</head>
<body><div id="app"></div></body>
</html>`
}

const BASE_CSS = `
:root { color-scheme: light; --fg: #0a0a0a; --bg: #ffffff; --muted: #737373; --border: #e5e5e5; --accent: #f97316; --surface: #f5f5f5 }
.dark { color-scheme: dark; --fg: #fafafa; --bg: #141413; --muted: #a3a3a3; --border: #2a2a2a; --surface: #1f1f1e }
* { box-sizing: border-box }
html, body { margin: 0; min-height: 100% }
body { padding: 24px; font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--fg); background: var(--bg); -webkit-font-smoothing: antialiased }
@layer base {
:root button { font: inherit; color: inherit; cursor: pointer; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); transition: background .15s, transform .1s }
:root button:hover:not(:disabled) { background: color-mix(in srgb, var(--surface), var(--fg) 8%) }
:root button:active:not(:disabled) { transform: scale(.97) }
:root button:disabled { opacity: .45; cursor: not-allowed }
:root input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), :root textarea, :root select { font: inherit; color: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); outline: none }
:root input:focus-visible, :root textarea:focus-visible, :root select:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent) }
:root input[type=checkbox], :root input[type=radio], :root input[type=range] { accent-color: var(--accent) }
}
h1, h2, h3 { line-height: 1.2; margin: 0 0 .5em }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em }
`

// Runs inside the iframe: forwards the console and errors to the playground, swaps the storage
// APIs (unavailable in an opaque origin) for in-memory ones, then loads the modules.
const BOOT = `(() => {
  const send = (msg) => parent.postMessage(Object.assign({ __lux: true }, msg), '*')
  const fmt = (v, depth = 0) => {
    if (typeof v === 'string') return depth ? JSON.stringify(v) : v
    if (v instanceof Error) return (v.name || 'Error') + ': ' + v.message
    if (typeof v === 'function') return 'ƒ ' + (v.name || 'anonymous') + '()'
    if (v && typeof v === 'object') {
      if (depth > 2) return Array.isArray(v) ? '[…]' : '{…}'
      if (typeof Node !== 'undefined' && v instanceof Node) return '<' + (v.nodeName || '').toLowerCase() + '>'
      try {
        if (Array.isArray(v)) return '[' + v.map((x) => fmt(x, depth + 1)).join(', ') + ']'
        return '{ ' + Object.keys(v).map((k) => k + ': ' + fmt(v[k], depth + 1)).join(', ') + ' }'
      } catch { return String(v) }
    }
    return String(v)
  }
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[level]
    console[level] = (...args) => { send({ type: 'console', level, text: args.map((a) => fmt(a)).join(' ') }); original.apply(console, args) }
  }
  addEventListener('error', (e) => send({ type: 'console', level: 'error', text: e.error ? fmt(e.error) : e.message }))
  addEventListener('unhandledrejection', (e) => send({ type: 'console', level: 'error', text: 'Uncaught (in promise) ' + fmt(e.reason) }))
  const memory = () => {
    const m = new Map()
    return { get length() { return m.size }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(String(k), String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear() }
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    try { window[name].length } catch { Object.defineProperty(window, name, { value: memory(), configurable: true }) }
  }
  try { history.replaceState(history.state, '') } catch {
    for (const fn of ['pushState', 'replaceState']) history[fn] = () => {}
  }
  addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]')
    if (a && !a.target && /^https?:/.test(a.href)) { e.preventDefault(); window.open(a.href, '_blank') }
  })
  globalThis.__LUX_DEV__ = true
  const p = JSON.parse(document.getElementById('lux-payload').textContent)
  for (const m of p.missing) console.error(m)
  const blob = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  const runtime = blob(p.lux)
  const imports = { '@inflector/lux': runtime, '@inflector/lux/internal': runtime, '@inflector/lux-router': blob(p.router) }
  for (const name of p.externals) imports[name] = 'https://esm.sh/' + name + '?external=@inflector/lux'
  for (const [name, code] of Object.entries(p.modules)) imports[name] = blob(code)
  const map = document.createElement('script')
  map.type = 'importmap'
  map.textContent = JSON.stringify({ imports })
  document.head.append(map)
  const start = performance.now()
  import('@inflector/lux').then((lux) =>
    import(p.entry).then((m) => {
      if (typeof m.default !== 'function') throw new Error('App.lx must be a component')
      lux.mount(m.default, document.getElementById('app'))
      send({ type: 'mounted', ms: performance.now() - start })
    }),
  ).catch((err) => { console.error(err); send({ type: 'mounted', ms: performance.now() - start }) })
})()`

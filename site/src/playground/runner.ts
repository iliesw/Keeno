// Builds the preview iframe's document from compiled files. The iframe is sandboxed (its own
// opaque origin), so it creates the module blobs itself: imports between playground files are
// rewritten to bare `@pg/` specifiers, which an import map resolves to those blobs, next to the
// Keeno runtime. Other bare imports load from esm.sh.
import { keeno, router } from 'virtual:keeno-runtime'
import type { CompiledFile } from './types'

export const ENTRY = 'App.kn'

const SPECIFIER = /(\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s*(?:[\w*{}\s,$]+\s*from\s*)|\bimport\s*\(\s*)(['"])([^'"\n]+)\2/g

/** `./Card.kn` from `App.kn` → `Card.kn` (playground files are flat, but allow `./x/../`). */
function resolveRelative(spec: string, names: Set<string>): string | null {
  const parts: string[] = []
  for (const p of spec.split('/')) {
    if (p === '.' || p === '') continue
    if (p === '..') parts.pop()
    else parts.push(p)
  }
  const base = parts.join('/')
  for (const candidate of [base, `${base}.kn`, `${base}.ts`, `${base}.js`]) if (names.has(candidate)) return candidate
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
      if (!spec.startsWith('@inflector/keeno') && !/^(https?:|data:|blob:)/.test(spec)) externals.add(spec)
      return all
    })
  }
  const css = files.map((f) => f.css).filter(Boolean).join('\n')
  const payload = {
    keeno,
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
<style id="keeno-css">${css.replace(/<\/style/gi, '<\\/style')}</style>
${options.tailwind ? '<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>\n<style type="text/tailwindcss">@custom-variant dark (&:where(.dark, .dark *));</style>' : ''}
<script type="application/json" id="keeno-payload">${json}</script>
<script>${BOOT}</script>
</head>
<body><div id="app"></div></body>
</html>`
}

const BASE_CSS = `
:root { color-scheme: light; --fg: #171717; --bg: #ffffff; --muted: #666666; --faint: #8f8f8f; --border: #ebebeb; --border-strong: #d4d4d4; --accent: #171717; --surface: #f5f5f5; --hover: #f2f2f2; --link: #0068d6; --success: #28a948; --danger: #e5484d; --warning: #f5a623; --info: #0070f3; --font-sans: Geist, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace; --ease-spring: cubic-bezier(.32, .72, 0, 1) }
.dark { color-scheme: dark; --fg: #ededed; --bg: #0a0a0a; --muted: #a1a1a1; --faint: #707070; --border: #242424; --border-strong: #333333; --accent: #ededed; --surface: #1a1a1a; --hover: #1f1f1f; --link: #52a8ff; --success: #3cb35b; --danger: #ff6166; --warning: #ffb224; --info: #52a8ff }
* { box-sizing: border-box }
html, body { margin: 0; min-height: 100% }
body { padding: 24px; font: 14px/1.5 var(--font-sans); color: var(--fg); background: var(--bg); -webkit-font-smoothing: antialiased }
@layer base {
:root button { display: inline-flex; align-items: center; justify-content: center; gap: .375rem; min-height: 2rem; padding: 0 .75rem; font: inherit; font-weight: 500; color: inherit; cursor: pointer; border-radius: .5rem; border: 1px solid var(--border); background: var(--bg); box-shadow: 0 1px 1px rgb(0 0 0 / .03); transition: background .15s, border-color .15s, color .15s, transform .15s var(--ease-spring) }
:root button:hover:not(:disabled) { background: var(--hover); border-color: var(--border-strong) }
:root button:active:not(:disabled) { transform: scale(.97) }
:root button:focus-visible { outline: 2px solid var(--link); outline-offset: 2px }
:root button:disabled { opacity: .4; cursor: not-allowed }
:root input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), :root textarea, :root select { min-height: 2.25rem; font: inherit; color: inherit; padding: 0 .75rem; border-radius: .5rem; border: 1px solid var(--border); background: var(--bg); outline: none; transition: border-color .15s, box-shadow .15s }
:root textarea { padding-block: .5rem }
:root input::placeholder, :root textarea::placeholder { color: var(--faint) }
:root input:hover:not(:focus):not(:disabled), :root textarea:hover:not(:focus):not(:disabled), :root select:hover:not(:focus):not(:disabled) { border-color: var(--border-strong) }
:root input:focus-visible, :root textarea:focus-visible, :root select:focus-visible { border-color: var(--faint); box-shadow: 0 0 0 3px color-mix(in srgb, var(--fg) 10%, transparent) }
:root input[type=checkbox], :root input[type=radio], :root input[type=range] { accent-color: var(--fg) }
:root input[type=checkbox], :root input[type=radio] { width: 1rem; height: 1rem; margin: 0 }
}
h1, h2, h3 { line-height: 1.2; margin: 0 0 .5em; font-weight: 600; letter-spacing: -.02em }
code { font-family: var(--font-mono); font-size: .9em }
`

// Runs inside the iframe: forwards the console and errors to the playground, swaps the storage
// APIs (unavailable in an opaque origin) for in-memory ones, then loads the modules.
const BOOT = `(() => {
  const send = (msg) => parent.postMessage(Object.assign({ __keeno: true }, msg), '*')
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
  globalThis.__KEENO_DEV__ = true
  const p = JSON.parse(document.getElementById('keeno-payload').textContent)
  for (const m of p.missing) console.error(m)
  const blob = (code) => URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  const runtime = blob(p.keeno)
  const imports = { '@inflector/keeno': runtime, '@inflector/keeno/internal': runtime, '@inflector/keeno-router': blob(p.router) }
  for (const name of p.externals) imports[name] = 'https://esm.sh/' + name + '?external=@inflector/keeno'
  for (const [name, code] of Object.entries(p.modules)) imports[name] = blob(code)
  const map = document.createElement('script')
  map.type = 'importmap'
  map.textContent = JSON.stringify({ imports })
  document.head.append(map)
  const start = performance.now()
  import('@inflector/keeno').then((keeno) =>
    import(p.entry).then((m) => {
      if (typeof m.default !== 'function') throw new Error('App.kn must be a component')
      keeno.mount(m.default, document.getElementById('app'))
      send({ type: 'mounted', ms: performance.now() - start })
    }),
  ).catch((err) => { console.error(err); send({ type: 'mounted', ms: performance.now() - start }) })
})()`

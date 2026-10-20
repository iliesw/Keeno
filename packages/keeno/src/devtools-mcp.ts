// Browser half of the dev tools MCP bridge: `@inflector/vite-plugin-keeno` serves an MCP endpoint
// on the dev server (`/__keeno/mcp`), and forwards each tool call over Vite's HMR socket to the
// page, where `connectMcp` answers it from `__KEENO_DEVTOOLS__` (devtools.ts). Values are turned
// into plain JSON here, since app state can hold DOM nodes, functions and cycles.
import type { DevComponent } from './devtools'

/** What the bridge needs from Vite's `import.meta.hot`. */
export interface McpChannel {
  send(event: string, data: unknown): void
  on(event: string, fn: (data: any) => void): void
}

interface Call {
  id: number
  /** The page the server addressed: calls for other tabs are ignored. */
  page: string
  tool: string
  args: Record<string, any>
}

/** A tool call by a coding agent, as the dev server reports it to every tab. */
export interface McpActivity {
  id: number
  tool: string
  args: Record<string, unknown>
  /** The tab that answered (null: answered by the server). */
  page: string | null
  /** The agent, from its MCP `initialize` (`claude-code`, ...). */
  client: string | null
  start: number
  /** Set once the call is done. */
  ms?: number
  ok?: boolean
  /** The start of the result, or the error. */
  summary?: string
}

/** Whether coding agents can reach the app, from `/__keeno/mcp/status`. */
export interface McpStatus {
  url: string
  /** Where Claude Code has the `keeno` server configured, if it does. */
  installed: { scope: 'local' | 'project' | 'user'; url: string } | null
  /** The last agent that connected. */
  client: { name: string; version: string; lastSeen: number } | null
  /** The `claude` CLI is on the dev server's PATH. */
  cli: boolean
}

export interface McpInstallResult {
  ok: boolean
  message: string
}

/** On `globalThis.__KEENO_MCP__`, for the dev tools panel's Agent tab. */
export interface McpBridge {
  version: 1
  page: string
  activity(): McpActivity[]
  subscribe(fn: () => void): () => void
  status(): Promise<McpStatus>
  install(): Promise<McpInstallResult>
}

interface ConsoleEntry {
  time: number
  level: 'error' | 'warn' | 'uncaught' | 'rejection'
  message: string
  stack?: string
}

const CONSOLE_LIMIT = 200
const ACTIVITY_LIMIT = 200
const STRING_LIMIT = 2000
const ITEMS_LIMIT = 50
const g = globalThis as any

/** A plain-JSON copy of `value`, with deep or large parts cut short. */
export function toJson(value: unknown, depth = 4, seen = new WeakSet<object>()): unknown {
  if (value === undefined) return '[undefined]'
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'symbol') return value.toString()
  if (typeof value === 'string') return value.length > STRING_LIMIT ? value.slice(0, STRING_LIMIT) + `… (${value.length} chars)` : value
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
  const obj = value as object
  if (typeof (obj as Node).nodeType === 'number') return describeNode(obj as Node)
  if (obj instanceof Error) return { error: obj.name, message: obj.message, stack: obj.stack?.split('\n').slice(0, 8).join('\n') }
  if (obj instanceof Date) return obj.toISOString()
  if (obj instanceof RegExp) return String(obj)
  if (seen.has(obj)) return '[Circular]'
  if (typeof (obj as any).then === 'function') return '[Promise]'
  if (depth <= 0) return Array.isArray(obj) ? `[Array(${obj.length})]` : `[${obj.constructor?.name ?? 'Object'}]`
  seen.add(obj)
  try {
    if (Array.isArray(obj)) {
      const out = obj.slice(0, ITEMS_LIMIT).map((v) => toJson(v, depth - 1, seen))
      if (obj.length > ITEMS_LIMIT) out.push(`… ${obj.length - ITEMS_LIMIT} more`)
      return out
    }
    if (obj instanceof Map) return { $map: toJson([...obj].slice(0, ITEMS_LIMIT), depth, seen) }
    if (obj instanceof Set) return { $set: toJson([...obj].slice(0, ITEMS_LIMIT), depth, seen) }
    const out: Record<string, unknown> = {}
    const keys = Object.keys(obj)
    for (const key of keys.slice(0, ITEMS_LIMIT)) {
      try {
        out[key] = toJson((obj as any)[key], depth - 1, seen)
      } catch (err) {
        out[key] = `[threw ${String(err)}]`
      }
    }
    if (keys.length > ITEMS_LIMIT) out['…'] = `${keys.length - ITEMS_LIMIT} more keys`
    return out
  } finally {
    seen.delete(obj)
  }
}

function describeNode(n: Node): string {
  if (n.nodeType === 3) return `#text ${JSON.stringify((n.textContent ?? '').slice(0, 80))}`
  if (n.nodeType !== 1) return `[${n.nodeName}]`
  const el = n as Element
  const id = el.id ? `#${el.id}` : ''
  const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''
  return `<${el.tagName.toLowerCase()}${id}${cls}>`
}

function api() {
  const a = g.__KEENO_DEVTOOLS__
  if (!a || !(a.version >= 2)) throw new Error('The Keeno dev tools are not installed in this page yet: nothing has been mounted.')
  return a
}

function flatten(nodes: DevComponent[], out: { id: number; name: string; file: string | null; path: string[] }[] = [], path: string[] = []) {
  for (const c of nodes) {
    out.push({ id: c.id, name: c.name, file: c.file, path })
    flatten(c.children, out, [...path, c.name])
  }
  return out
}

/** The component tree, cut at `depth`, as `{ id, name, file, updates, errors, children }`. */
function prune(nodes: DevComponent[], depth: number): unknown[] {
  return nodes.map((c) => {
    const row: Record<string, unknown> = { id: c.id, name: c.name, file: c.file }
    if (c.updates) row.updates = c.updates
    if (c.errors) row.errors = c.errors
    if (c.children.length) row.children = depth > 1 ? prune(c.children, depth - 1) : `${c.children.length} children (raise depth)`
    return row
  })
}

function serializeHtml(nodes: Node[], max: number): string {
  let html = ''
  for (const n of nodes) html += n.nodeType === 1 ? (n as Element).outerHTML : n.nodeType === 3 ? n.textContent : ''
  return html.length > max ? html.slice(0, max) + `\n… (${html.length} chars)` : html
}

async function run(code: string): Promise<unknown> {
  let fn: () => Promise<unknown>
  try {
    // An expression gives its value; statements need an explicit `return`.
    fn = new Function(`return (async () => (${code}\n))()`) as any
  } catch {
    fn = new Function(`return (async () => {${code}\n})()`) as any
  }
  return fn()
}

const tools: Record<string, (args: Record<string, any>, log: ConsoleEntry[]) => unknown> = {
  tree({ filter, depth = 6 }) {
    const a = api()
    const roots: DevComponent[] = a.components()
    const result: Record<string, unknown> = { url: location.href }
    if (filter) {
      const q = String(filter).toLowerCase()
      result.matches = flatten(roots).filter((c) => c.name.toLowerCase().includes(q) || c.file?.toLowerCase().includes(q))
    } else {
      result.components = prune(roots, depth)
    }
    result.stores = a.stores().length
    if (a.traveling() !== null) result.timeTravel = `showing the app as of write #${a.traveling()} (keeno_travel with seq null goes back to live)`
    return result
  },
  inspect({ id }) {
    const a = api()
    const details = a.details(id)
    if (!details) throw new Error(`No component with id ${id} (ids come from keeno_tree; they change when a component remounts).`)
    const names = new Map(flatten(a.components()).map((c) => [c.id, c.name]))
    return { ...(toJson(details, 6) as object), ancestors: a.path(id).slice(0, -1).map((i: number) => `${names.get(i)} (${i})`) }
  },
  dom({ id, maxLength = 8000 }) {
    const nodes: Node[] = api().nodes(id)
    if (!nodes.length) throw new Error(`Component ${id} has no DOM nodes (unknown id, or it renders nothing).`)
    return serializeHtml(nodes, maxLength)
  },
  locate({ selector }) {
    const all = [...document.querySelectorAll(selector)].slice(0, 20)
    if (!all.length) throw new Error(`Nothing matches ${selector}`)
    const a = api()
    const names = new Map(flatten(a.components()).map((c) => [c.id, c]))
    return all.map((el) => {
      const id = a.at(el)
      const c = id === null ? null : names.get(id)
      return { element: describeNode(el), component: c ? { id, name: c.name, file: c.file, path: [...c.path, c.name].join(' > ') } : null }
    })
  },
  stores() {
    return toJson(api().stores(), 6)
  },
  set_state({ id, value, action = 'set' }) {
    const a = api()
    if (action === 'undo') a.undo(id)
    else if (action === 'redo') a.redo(id)
    else if (!a.set(id, value, 'agent')) throw new Error(`Signal ${id} is not a writable state (a derived, or an unknown id).`)
    return { ok: true }
  },
  timeline({ limit = 50, component, signal, type }) {
    let log: any[] = api().log()
    if (component != null) log = log.filter((e) => e.component === component)
    if (signal != null) log = log.filter((e) => e.type === 'write' && e.signal === signal)
    if (type) log = log.filter((e) => e.type === type)
    return { total: log.length, events: toJson(log.slice(-limit), 5) }
  },
  deps({ id }) {
    const deps = api().deps(id)
    if (!deps) throw new Error(`No signal with id ${id}`)
    return deps
  },
  graph({ component = null }) {
    return api().graph(component)
  },
  perf({ reset }) {
    const a = api()
    const stats = a.stats()
    if (reset) a.resetStats()
    return stats
  },
  routes() {
    return toJson(api().routers(), 6)
  },
  navigate({ to, router }) {
    const a = api()
    const list = a.routers()
    const target = router ?? list[0]?.id
    if (target === undefined) throw new Error('No <Router> is mounted in this page.')
    a.navigate(target, to)
    return { ok: true }
  },
  travel({ seq = null }) {
    api().travel(seq)
    return { traveling: api().traveling() }
  },
  console({ limit = 50, clear }, log) {
    const out = log.slice(-limit)
    if (clear) log.length = 0
    return out
  },
  async eval({ code }) {
    return toJson(await run(code), 5)
  },
}

/**
 * Answer MCP tool calls from the dev server over `channel` (Vite's `import.meta.hot`), and keep
 * the page's console errors and warnings for `keeno_console`.
 */
export function connectMcp(channel: McpChannel): void {
  if (typeof window === 'undefined' || g.__KEENO_MCP__) return
  const page = Math.random().toString(36).slice(2, 10)
  const activity: McpActivity[] = []
  const listeners = new Set<() => void>()
  const endpoint = async (path: string, init?: RequestInit) => {
    const res = await fetch(`/__keeno/mcp/${path}`, init)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return res.json()
  }
  const bridge: McpBridge = {
    version: 1,
    page,
    activity: () => activity.slice(),
    subscribe(fn) {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    status: () => endpoint('status'),
    install: () => endpoint('install', { method: 'POST' }),
  }
  g.__KEENO_MCP__ = bridge
  window.dispatchEvent(new Event('keeno:mcp'))
  channel.on('keeno:mcp-activity', (a: McpActivity) => {
    const i = activity.findIndex((x) => x.id === a.id)
    if (i >= 0) activity[i] = { ...activity[i], ...a }
    else {
      activity.push(a)
      if (activity.length > ACTIVITY_LIMIT) activity.shift()
    }
    for (const fn of listeners) fn()
  })
  const log: ConsoleEntry[] = []
  const push = (entry: ConsoleEntry) => {
    log.push(entry)
    if (log.length > CONSOLE_LIMIT) log.shift()
  }
  const text = (args: unknown[]) =>
    args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(toJson(a, 2)))).join(' ')
  for (const level of ['error', 'warn'] as const) {
    const original = console[level]
    console[level] = (...args: unknown[]) => {
      const err = args.find((a) => a instanceof Error) as Error | undefined
      push({ time: Date.now(), level, message: text(args), stack: err?.stack })
      original.apply(console, args)
    }
  }
  window.addEventListener('error', (e) => push({ time: Date.now(), level: 'uncaught', message: e.message, stack: e.error?.stack }))
  window.addEventListener('unhandledrejection', (e) =>
    push({ time: Date.now(), level: 'rejection', message: text([e.reason]), stack: e.reason?.stack }),
  )

  const hello = () => channel.send('keeno:mcp-hello', { page, url: location.href, title: document.title, focused: document.hasFocus() })
  channel.on('keeno:mcp-call', async (call: Call) => {
    if (call.page !== page) return
    try {
      const tool = tools[call.tool]
      if (!tool) throw new Error(`Unknown tool ${call.tool}`)
      const result = await tool(call.args ?? {}, log)
      channel.send('keeno:mcp-result', { id: call.id, ok: true, result })
    } catch (err: any) {
      channel.send('keeno:mcp-result', { id: call.id, ok: false, error: err?.message ?? String(err) })
    }
  })
  // The server addresses the tab the developer looked at last.
  window.addEventListener('focus', hello)
  window.addEventListener('popstate', hello)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && hello())
  // After a server restart the socket reconnects and the server has forgotten this page.
  channel.on('vite:ws:connect', hello)
  channel.on('keeno:mcp-ping', hello)
  hello()
}

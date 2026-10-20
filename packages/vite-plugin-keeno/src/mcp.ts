// Dev tools over MCP: during `vite dev`, `/__keeno/mcp` is a Model Context Protocol server
// (Streamable HTTP, JSON responses) that lets coding agents such as Claude Code look into the
// running app. Each tool call goes over Vite's HMR socket to an open tab, where
// `connectMcp` (@inflector/keeno/mcp) answers it from the dev tools API.
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import { findInstall, hasCli, install } from './install'

export const MCP_PATH = '/__keeno/mcp'
/** Imported by every `.kn` module in dev: connects the page to the bridge. */
export const MCP_CLIENT_ID = 'virtual:keeno-mcp'
export const RESOLVED_MCP_CLIENT_ID = '\0' + MCP_CLIENT_ID

export const mcpClientModule = [
  `import { connectMcp } from '@inflector/keeno/mcp'`,
  `if (import.meta.hot) connectMcp(import.meta.hot)`,
  ``,
].join('\n')

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const CALL_TIMEOUT = 10_000
const SERVER_ERRORS_LIMIT = 50
const SUMMARY_LIMIT = 300

/** Problems the browser can't see: compile errors and server-side failures. */
export class ServerErrors {
  /** The current compile error of each file (cleared when it compiles again). */
  compile = new Map<string, { time: number; message: string; loc?: unknown }>()
  runtime: { time: number; kind: string; message: string; stack?: string }[] = []

  compiled(file: string, err?: any) {
    if (err) this.compile.set(file, { time: Date.now(), message: err.message ?? String(err), loc: err.loc })
    else this.compile.delete(file)
  }

  failed(kind: string, err: any) {
    this.runtime.push({ time: Date.now(), kind, message: err?.message ?? String(err), stack: err?.stack?.split('\n').slice(0, 10).join('\n') })
    if (this.runtime.length > SERVER_ERRORS_LIMIT) this.runtime.shift()
  }
}

interface Tool {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  /** Answered by the server instead of a browser tab. */
  local?: boolean
}

const id = (what: string) => ({ type: 'number', description: what })
const pageArg = { page: { type: 'string', description: 'Tab to ask (from keeno_pages). Default: the tab focused last.' } }

export const TOOLS: Tool[] = [
  {
    name: 'keeno_pages',
    description: 'List the browser tabs connected to the Keeno dev server, with their URL and title. The other tools ask the tab focused last unless given `page`.',
    inputSchema: { type: 'object', properties: {} },
    local: true,
  },
  {
    name: 'keeno_tree',
    description:
      'The live component tree of the page: id, name, source file, update count and error count of each component. With `filter`, a flat list of the components whose name or file contains it, with their ancestors. Start here: the other tools take these ids.',
    inputSchema: {
      type: 'object',
      properties: { filter: { type: 'string' }, depth: { type: 'number', description: 'Levels to include (default 6)' }, ...pageArg },
    },
  },
  {
    name: 'keeno_inspect',
    description:
      "A component's props, its states and deriveds (by variable name, with signal ids, current values, errors, pending and history flags), its errors and its ancestors.",
    inputSchema: { type: 'object', properties: { id: id('Component id from keeno_tree'), ...pageArg }, required: ['id'] },
  },
  {
    name: 'keeno_dom',
    description: 'The rendered HTML of a component.',
    inputSchema: {
      type: 'object',
      properties: { id: id('Component id'), maxLength: { type: 'number', description: 'Default 8000 characters' }, ...pageArg },
      required: ['id'],
    },
  },
  {
    name: 'keeno_locate',
    description: 'Which component renders the elements matching a CSS selector (up to 20 matches), with its file and path in the tree.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' }, ...pageArg }, required: ['selector'] },
  },
  {
    name: 'keeno_stores',
    description: 'States and deriveds created outside components (shared stores), with ids and values.',
    inputSchema: { type: 'object', properties: { ...pageArg } },
  },
  {
    name: 'keeno_set_state',
    description: 'Write a state in the running app (`value` is JSON), or undo/redo a state that has `history`. Signal ids come from keeno_inspect or keeno_stores.',
    inputSchema: {
      type: 'object',
      properties: { id: id('Signal id'), value: { description: 'New value' }, action: { enum: ['set', 'undo', 'redo'] }, ...pageArg },
      required: ['id'],
    },
  },
  {
    name: 'keeno_timeline',
    description:
      'Recent state writes (signal, component, old and new value, and their source: user code, URL, another tab, undo) and component errors, oldest first. Filter by component id, signal id or type.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Default 50' },
        component: id('Only events of this component'),
        signal: id('Only writes to this signal'),
        type: { enum: ['write', 'error'] },
        ...pageArg,
      },
    },
  },
  {
    name: 'keeno_deps',
    description: 'What a signal reads (sources) and what reads it (deriveds, and components whose renders or effects use it). Use it to find out why something did or did not update.',
    inputSchema: { type: 'object', properties: { id: id('Signal id'), ...pageArg }, required: ['id'] },
  },
  {
    name: 'keeno_graph',
    description: 'The dependency graph of a component\'s signals as { nodes, edges } (omit `component` for the stores).',
    inputSchema: { type: 'object', properties: { component: id('Component id'), ...pageArg } },
  },
  {
    name: 'keeno_perf',
    description: 'Render performance: component and signal counts, flushes and their durations, and the components that update most. `reset` zeroes the counters after reading them, to measure one interaction.',
    inputSchema: { type: 'object', properties: { reset: { type: 'boolean' }, ...pageArg } },
  },
  {
    name: 'keeno_routes',
    description: 'Each mounted <Router>: its routes (with layouts and error pages), the current location with params and matched route, and the navigation history.',
    inputSchema: { type: 'object', properties: { ...pageArg } },
  },
  {
    name: 'keeno_navigate',
    description: 'Navigate the app client-side to a path.',
    inputSchema: { type: 'object', properties: { to: { type: 'string' }, router: id('Router id (default: the first)'), ...pageArg }, required: ['to'] },
  },
  {
    name: 'keeno_travel',
    description: 'Time travel: show the app as it was right after the write `seq` (from keeno_timeline). `seq: null` goes back to live.',
    inputSchema: { type: 'object', properties: { seq: { type: ['number', 'null'] }, ...pageArg }, required: ['seq'] },
  },
  {
    name: 'keeno_console',
    description: 'console.error and console.warn output, uncaught errors and unhandled rejections of the page (Keeno development warnings included).',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Default 50' }, clear: { type: 'boolean' }, ...pageArg } },
  },
  {
    name: 'keeno_eval',
    description:
      'Run JavaScript in the page and return its result as JSON (awaited). An expression returns its value; for statements, `return` the result. `__KEENO_DEVTOOLS__` is the dev tools API.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' }, ...pageArg }, required: ['code'] },
  },
  {
    name: 'keeno_server_errors',
    description: 'Current .kn compile errors, and recent errors thrown by server functions and server rendering.',
    inputSchema: { type: 'object', properties: {} },
    local: true,
  },
]

const INSTRUCTIONS =
  'Live view into a Keeno app running under `vite dev`. Start with keeno_tree (or keeno_locate with a selector), ' +
  'then keeno_inspect a component for its props and states. keeno_timeline and keeno_deps explain updates; ' +
  'keeno_console and keeno_server_errors show errors. A browser tab with the app must be open.'

interface Page {
  page: string
  url: string
  title: string
  seen: number
  /** Raised each time the tab says hello (focus, navigation): the highest is the one in use. */
  order: number
  client: { send(event: string, data?: unknown): void; socket?: { once?(e: string, fn: () => void): void } }
}

interface RpcMessage {
  jsonrpc: '2.0'
  id?: string | number | null
  method?: string
  params?: any
}

/** Loopback addresses: the endpoint runs code in the developer's browser, so only local agents get it. */
function isLocal(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  if (!/^(127\.|::1$|::ffff:127\.)/.test(addr)) return false
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(origin).hostname)
  } catch {
    return false
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

/** The endpoint's URL as the browser reaches the dev server. */
function mcpUrl(req: IncomingMessage): string {
  return `http://${req.headers.host ?? 'localhost:5173'}${MCP_PATH}`
}

function json(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status
  if (body === undefined) return void res.end()
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

export function setupMcp(server: ViteDevServer, errors: ServerErrors, version: string) {
  const pages = new Map<string, Page>()
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>()
  let nextCall = 1
  let hellos = 0
  /** The agent that initialized last, for the panel. */
  let agent: { name: string; version: string; lastSeen: number } | null = null
  let nextActivity = 1
  const broadcast = (data: object) => server.ws.send({ type: 'custom', event: 'keeno:mcp-activity', data })

  server.ws.on('keeno:mcp-hello', (data: any, client: Page['client']) => {
    const known = pages.get(data.page)
    pages.set(data.page, { page: data.page, url: data.url, title: data.title, seen: Date.now(), order: ++hellos, client })
    if (!known) client.socket?.once?.('close', () => pages.delete(data.page))
  })
  server.ws.on('keeno:mcp-result', (data: any) => {
    const call = pending.get(data.id)
    if (!call) return
    pending.delete(data.id)
    clearTimeout(call.timer)
    if (data.ok) call.resolve(data.result)
    else call.reject(new Error(data.error))
  })

  const pick = (page?: string): Page => {
    if (page) {
      const p = pages.get(page)
      if (!p) throw new Error(`No connected tab ${page}: see keeno_pages.`)
      return p
    }
    const latest = [...pages.values()].sort((a, b) => b.order - a.order)[0]
    if (!latest) {
      // Tabs opened before a server restart announce themselves again when asked.
      server.ws.send({ type: 'custom', event: 'keeno:mcp-ping' })
      const url = server.resolvedUrls?.local[0] ?? 'the dev server URL'
      throw new Error(`No browser tab with the app is connected. Open ${url} in a browser (or reload the open tab) and try again.`)
    }
    return latest
  }

  const callPage = (tool: string, args: Record<string, any>, onTarget: (page: string) => void) => {
    const { page, ...rest } = args
    const target = pick(page)
    onTarget(target.page)
    const callId = nextCall++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(callId)
        reject(new Error(`The tab ${target.url} did not answer within ${CALL_TIMEOUT / 1000}s (closed, frozen at a breakpoint, or in the background).`))
      }, CALL_TIMEOUT)
      pending.set(callId, { resolve, reject, timer })
      target.client.send('keeno:mcp-call', { id: callId, page: target.page, tool, args: rest })
    })
  }

  const callTool = async (name: string, args: Record<string, any>, onTarget: (page: string) => void = () => {}): Promise<unknown> => {
    if (name === 'keeno_pages') {
      return [...pages.values()].sort((a, b) => b.order - a.order).map((p) => ({ page: p.page, url: p.url, title: p.title, lastFocused: new Date(p.seen).toISOString() }))
    }
    if (name === 'keeno_server_errors') {
      return { compile: Object.fromEntries(errors.compile), runtime: errors.runtime }
    }
    if (!TOOLS.some((t) => t.name === name)) throw new Error(`Unknown tool ${name}`)
    return callPage(name.slice('keeno_'.length), args, onTarget)
  }

  const handle = async (msg: RpcMessage): Promise<object | null> => {
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id: msg.id, result })
    const fail = (code: number, message: string) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } })
    if (msg?.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid request')
    // Notifications (`notifications/initialized`, ...) need no answer.
    if (msg.id === undefined) return null
    switch (msg.method) {
      case 'initialize': {
        const info = msg.params?.clientInfo
        agent = { name: String(info?.name ?? 'unknown'), version: String(info?.version ?? ''), lastSeen: Date.now() }
        const asked = msg.params?.protocolVersion
        return reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'keeno', title: 'Keeno dev tools', version },
          instructions: INSTRUCTIONS,
        })
      }
      case 'ping':
        return reply({})
      case 'tools/list':
        return reply({ tools: TOOLS.map(({ local, ...t }) => t) })
      case 'tools/call': {
        // Every tab's dev tools show what the agent does.
        const name = String(msg.params?.name)
        const args = msg.params?.arguments ?? {}
        const activity = { id: nextActivity++, tool: name, args, page: null as string | null, client: agent?.name ?? null, start: Date.now() }
        broadcast(activity)
        const done = (ok: boolean, text: string) => {
          const summary = text.length > SUMMARY_LIMIT ? text.slice(0, SUMMARY_LIMIT) + '…' : text
          broadcast({ id: activity.id, page: activity.page, ok, ms: Date.now() - activity.start, summary })
          return reply(ok ? { content: [{ type: 'text', text }] } : { content: [{ type: 'text', text }], isError: true })
        }
        try {
          const result = await callTool(name, args, (page) => (activity.page = page))
          return done(true, typeof result === 'string' ? result : JSON.stringify(result, null, 2))
        } catch (err: any) {
          return done(false, err?.message ?? String(err))
        }
      }
      default:
        return fail(-32601, `Method not found: ${msg.method}`)
    }
  }

  server.middlewares.use(MCP_PATH, async (req, res) => {
    if (!isLocal(req)) return json(res, 403, { error: 'The Keeno MCP endpoint only accepts local requests.' })
    const sub = req.url?.split('?')[0].replace(/\/+$/, '') ?? ''
    // For the dev tools panel (Agent tab), from the page's origin.
    if (sub === '/status' && req.method === 'GET') {
      const root = server.config.root
      return json(res, 200, { url: mcpUrl(req), installed: findInstall(root), client: agent, cli: await hasCli(root) })
    }
    if (sub === '/install' && req.method === 'POST') {
      return json(res, 200, await install(server.config.root, mcpUrl(req)))
    }
    if (sub) return json(res, 404)
    if (agent) agent.lastSeen = Date.now()
    // No server-initiated stream (GET) and no sessions to end (DELETE).
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      return json(res, 405)
    }
    let body: unknown
    try {
      body = JSON.parse(await readBody(req))
    } catch {
      return json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handle))).filter(Boolean)
      return out.length ? json(res, 200, out) : json(res, 202)
    }
    const out = await handle(body as RpcMessage)
    return out ? json(res, 200, out) : json(res, 202)
  })

  // Next to Vite's own URLs when the server starts.
  const printUrls = server.printUrls.bind(server)
  server.printUrls = () => {
    printUrls()
    const local = server.resolvedUrls?.local[0]
    if (!local) return
    const url = new URL(MCP_PATH, local).href
    server.config.logger.info(`  \x1b[32m➜\x1b[0m  \x1b[1mMCP\x1b[0m:     \x1b[36m${url}\x1b[0m  \x1b[2m(claude mcp add --transport http keeno ${url})\x1b[0m`)
  }
}

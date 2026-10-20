import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import keeno from '../src/index'
import { MCP_PATH, ServerErrors, TOOLS, setupMcp } from '../src/mcp'

/** A dev server with just what setupMcp uses, and one browser tab answering over the socket. */
function fakeServer() {
  let handler: (req: any, res: any) => Promise<void>
  const ws = new Map<string, (data: any, client: any) => void>()
  const sent: any[] = []
  const server: any = {
    middlewares: { use: (p: string, fn: any) => (expect(p).toBe(MCP_PATH), (handler = fn)) },
    ws: { on: (e: string, fn: any) => ws.set(e, fn), send: (m: any) => sent.push(m) },
    resolvedUrls: { local: ['http://localhost:5173/'] },
    printUrls() {},
    config: { logger: { info() {} } },
  }
  const errors = new ServerErrors()
  setupMcp(server, errors, '1.2.3')

  const calls: any[] = []
  const tab = (page: string, answer: (call: any) => any) => {
    const client = {
      socket: new EventEmitter(),
      send(event: string, call: any) {
        calls.push(call)
        const out = answer(call)
        queueMicrotask(() => ws.get('keeno:mcp-result')!(out instanceof Error ? { id: call.id, ok: false, error: out.message } : { id: call.id, ok: true, result: out }, client))
      },
    }
    ws.get('keeno:mcp-hello')!({ page, url: `http://localhost:5173/${page}`, title: page }, client)
    return client
  }

  const post = async (body: unknown, headers: Record<string, string> = {}, remoteAddress = '127.0.0.1', method = 'POST', url = '/') => {
    const req: any = new EventEmitter()
    Object.assign(req, { method, url, headers, socket: { remoteAddress }, setEncoding() {} })
    let status = 0
    let text = ''
    const res: any = { setHeader() {}, set statusCode(s: number) { status = s }, end: (t?: string) => (text = t ?? '') }
    const done = handler(req, res)
    req.emit('data', typeof body === 'string' ? body : JSON.stringify(body))
    req.emit('end')
    await done
    return { status, body: text ? JSON.parse(text) : undefined }
  }
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
    return r.body.result as { content: { type: string; text: string }[]; isError?: boolean }
  }
  return { post, call, tab, calls, errors, sent }
}

describe('MCP endpoint', () => {
  test('initializes and lists the tools', async () => {
    const { post } = fakeServer()
    const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } })
    expect(init.body.result.protocolVersion).toBe('2025-06-18')
    expect(init.body.result.serverInfo).toMatchObject({ name: 'keeno', version: '1.2.3' })
    expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
    const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect(list.body.result.tools.map((t: any) => t.name)).toEqual(TOOLS.map((t) => t.name))
    expect(list.body.result.tools[0].local).toBeUndefined()
    expect((await post({ jsonrpc: '2.0', id: 3, method: 'nope' })).body.error.code).toBe(-32601)
  })

  test('only accepts local POST requests', async () => {
    const { post } = fakeServer()
    const ping = { jsonrpc: '2.0', id: 1, method: 'ping' }
    expect((await post(ping, {}, '192.168.1.20')).status).toBe(403)
    expect((await post(ping, { origin: 'https://evil.example' })).status).toBe(403)
    expect((await post(ping, { origin: 'http://localhost:5173' })).status).toBe(200)
    expect((await post(ping, {}, '::1')).status).toBe(200)
    expect((await post(ping, {}, '127.0.0.1', 'GET')).status).toBe(405)
    expect((await post('{oops')).status).toBe(400)
  })

  test('forwards tool calls to the tab focused last', async () => {
    const { call, tab, calls } = fakeServer()
    tab('a', () => 'from a')
    tab('b', (c) => ({ tool: c.tool, args: c.args }))
    const out = await call('keeno_inspect', { id: 4 })
    expect(JSON.parse(out.content[0].text)).toEqual({ tool: 'inspect', args: { id: 4 } })
    expect(calls[0].page).toBe('b')
    expect((await call('keeno_tree', { page: 'a' })).content[0].text).toBe('from a')
    const pages = JSON.parse((await call('keeno_pages')).content[0].text)
    expect(pages.map((p: any) => p.page).sort()).toEqual(['a', 'b'])
  })

  test('tells every tab what the agent does', async () => {
    const { post, call, tab, sent } = fakeServer()
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'claude-code', version: '2' } } })
    tab('a', () => ({ big: 'x'.repeat(1000) }))
    await call('keeno_inspect', { id: 3 })
    const events = sent.filter((m) => m.event === 'keeno:mcp-activity').map((m) => m.data)
    expect(events[0]).toMatchObject({ tool: 'keeno_inspect', args: { id: 3 }, client: 'claude-code' })
    expect(events[1]).toMatchObject({ id: events[0].id, page: 'a', ok: true })
    expect(events[1].summary.length).toBeLessThan(310)
    expect((await post(null, {}, '127.0.0.1', 'GET', '/nope')).status).toBe(404)
  })

  test('reports tab errors, closed tabs and missing tabs as tool errors', async () => {
    const { call, tab } = fakeServer()
    expect(await call('keeno_tree')).toMatchObject({ isError: true })
    expect((await call('keeno_tree')).content[0].text).toContain('Open http://localhost:5173/')
    const client = tab('a', () => new Error('No component with id 9'))
    expect(await call('keeno_inspect', { id: 9 })).toEqual({ content: [{ type: 'text', text: 'No component with id 9' }], isError: true })
    client.socket.emit('close')
    expect((await call('keeno_pages')).content[0].text).toBe('[]')
  })

  test('keeno_server_errors lists compile errors until the file compiles again', async () => {
    const { call, errors } = fakeServer()
    errors.compiled('src/A.kn', Object.assign(new Error('Cannot reassign state "a"'), { loc: { line: 2 } }))
    errors.failed('server function', new Error('db down'))
    let out = JSON.parse((await call('keeno_server_errors')).content[0].text)
    expect(out.compile['src/A.kn']).toMatchObject({ message: 'Cannot reassign state "a"', loc: { line: 2 } })
    expect(out.runtime[0]).toMatchObject({ kind: 'server function', message: 'db down' })
    errors.compiled('src/A.kn')
    out = JSON.parse((await call('keeno_server_errors')).content[0].text)
    expect(out.compile).toEqual({})
  })

  test('the plugin serves the bridge in dev, unless turned off', async () => {
    const root = path.resolve(import.meta.dir, '../../../examples/todo')
    const file = path.join(root, 'src/TodoItem.kn').replaceAll('\\', '/')
    const plugin = keeno() as any
    plugin.configResolved({ root, command: 'serve', isProduction: false })
    const server: any = {
      middlewares: { use() {} },
      ws: { on() {}, send() {} },
      watcher: { on() {} },
      printUrls() {},
      config: { logger: { info() {} } },
    }
    let handler: any
    server.middlewares.use = (p: string, fn: any) => p === MCP_PATH && (handler = fn)
    plugin.configureServer(server)
    expect(handler).toBeDefined()

    const ok = await plugin.transform(await Bun.file(file).text(), file)
    expect(ok.code).toContain('import "virtual:keeno-mcp"')
    expect(plugin.load('\0virtual:keeno-mcp')).toContain('connectMcp(import.meta.hot)')
    const off = keeno({ mcp: false }) as any
    off.configResolved({ root, command: 'serve', isProduction: false })
    expect((await off.transform(await Bun.file(file).text(), file)).code).not.toContain('virtual:keeno-mcp')
  })
})

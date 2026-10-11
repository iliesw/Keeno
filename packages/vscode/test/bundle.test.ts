// Run the bundled dist/server.js under Node (as VS Code does) and talk LSP to it over stdio.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dir, '..')
const repo = path.resolve(root, '../..')
const hasNode = spawnSync('node', ['--version']).status === 0

let proc: ChildProcess
let buffer = Buffer.alloc(0)
let nextId = 1
const pending = new Map<number, (v: any) => void>()

function send(msg: object) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...msg }))
  proc.stdin!.write(`Content-Length: ${body.length}\r\n\r\n`)
  proc.stdin!.write(body)
}
function request(method: string, params: unknown): Promise<any> {
  const id = nextId++
  send({ id, method, params })
  return new Promise((resolve) => pending.set(id, resolve))
}
function onData(chunk: Buffer) {
  buffer = Buffer.concat([buffer, chunk])
  while (true) {
    const sep = buffer.indexOf('\r\n\r\n')
    if (sep < 0) return
    const len = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, sep).toString())![1])
    if (buffer.length < sep + 4 + len) return
    const msg = JSON.parse(buffer.subarray(sep + 4, sep + 4 + len).toString())
    buffer = buffer.subarray(sep + 4 + len)
    if (msg.id != null && pending.has(msg.id) && !msg.method) {
      pending.get(msg.id)!(msg.result)
      pending.delete(msg.id)
    } else if (msg.id != null && msg.method) {
      send({ id: msg.id, result: null }) // answer server->client requests (configuration, registration…)
    }
  }
}

describe.skipIf(!hasNode)('bundled language server (Node)', () => {
  beforeAll(async () => {
    spawnSync('bun', ['run', 'scripts/build.ts', '--production'], { cwd: root }) // test what ships
    proc = spawn('node', [path.join(root, 'dist/server.js'), '--stdio'], { cwd: repo })
    proc.stdout!.on('data', onData)
    await request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(repo).href,
      capabilities: {},
      initializationOptions: { typescript: { tsdk: path.join(repo, 'node_modules/typescript/lib') } },
    })
    send({ method: 'initialized', params: {} })
  }, 60_000)

  afterAll(() => proc?.kill())

  test('completes state members in an .kn file', async () => {
    const uri = pathToFileURL(path.join(repo, 'examples/todo/src/__bundle.kn')).href
    const text = '<script lang="ts">\nconst n = state(1)\nn.\n</script>\n'
    send({ method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'keeno', version: 1, text } } })
    const list = await request('textDocument/completion', { textDocument: { uri }, position: { line: 2, character: 2 } })
    const labels = (list?.items ?? list ?? []).map((i: any) => i.label)
    expect(labels).toContain('set')
    expect(labels).toContain('toFixed')
  }, 60_000)
})

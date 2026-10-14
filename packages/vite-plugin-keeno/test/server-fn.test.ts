import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hash } from '@inflector/keeno-compiler'
import keeno, { serverFunctionFiles, serverFunctionsModule, serverModule } from '../src/index'
import { createHandler } from '../src/server'

const temp = mkdtempSync(path.join(tmpdir(), 'keeno-fns-'))
afterAll(() => rmSync(temp, { recursive: true, force: true }))

function setup(root: string, command: 'serve' | 'build', base = '/') {
  const plugin = keeno() as any
  plugin.configResolved({ root, command, isProduction: command === 'build', base })
  return plugin
}

describe('server functions in the plugin', () => {
  const root = path.join(temp, 'app')
  mkdirSync(path.join(root, 'src', 'lib'), { recursive: true })
  mkdirSync(path.join(root, 'node_modules', 'dep'), { recursive: true })
  const users = [`import { server } from '@inflector/keeno'`, `import { db } from './db'`, `export const getUser = server(async (id: string) => db.find(id))`].join('\n')
  writeFileSync(path.join(root, 'src', 'lib', 'users.ts'), users)
  writeFileSync(path.join(root, 'src', 'Post.kn'), `<script>const f = server(async () => 1)</script><p />`)
  writeFileSync(path.join(root, 'src', 'plain.ts'), `export const x = 1`)
  writeFileSync(path.join(root, 'node_modules', 'dep', 'index.js'), `server(() => 1)`)
  const file = path.join(root, 'src', 'lib', 'users.ts').replaceAll('\\', '/')

  test('finds the files that call server()', () => {
    expect(serverFunctionFiles(root)).toEqual(['src/Post.kn', 'src/lib/users.ts'])
  })

  test('.ts modules get stubs in the browser and keep the functions on the server', async () => {
    const client = await setup(root, 'build', '/app/').transform(users, file, {})
    expect(client.code).toContain(`server("${hash('src/lib/users.ts')}/0")`)
    expect(client.code).not.toContain('./db')
    expect(client.code).toContain('globalThis.__KEENO_BASE__ = "/app/"')
    const ssr = await setup(root, 'build').transform(users, file, { ssr: true })
    expect(ssr.code).toContain('export const $$serverFns')
    expect(ssr.code).not.toContain('__KEENO_BASE__')
    expect(await setup(root, 'build').transform(`export const x = 1`, path.join(root, 'src', 'plain.ts'), {})).toBeUndefined()
  })

  test('.kn components with server functions set the base in the browser', async () => {
    const kn = path.join(root, 'src', 'Post.kn').replaceAll('\\', '/')
    const out = await setup(root, 'build').transform(`<script>const f = server(async () => 1)</script><p />`, kn, {})
    expect(out.code).toContain('globalThis.__KEENO_BASE__ = "/"')
    const ssr = await setup(root, 'build').transform(`<script>const f = server(async () => 1)</script><p />`, kn, { ssr: true })
    expect(ssr.code).toContain('$$serverFns')
  })

  test('the registry loads each module by id, and the spa server bundle only has functions', () => {
    const code = serverFunctionsModule(['src/lib/users.ts'], { base: '/', dev: false })
    expect(code).toContain(`"${hash('src/lib/users.ts')}": () => import("/src/lib/users.ts")`)
    expect(code).toContain(`handleServerFunction(request, modules, {"base":"/","dev":false})`)
    expect(serverModule('spa')).toBe(`export { callServerFunction } from 'virtual:keeno-server-fns'\n`)
    const ssr = serverModule('ssr')
    expect(ssr).toContain('export { callServerFunction }')
    expect(ssr).toContain('withRequest(request, async () =>')
  })
})

describe('createHandler', () => {
  const dist = path.join(temp, 'dist')
  mkdirSync(path.join(dist, 'client', 'about'), { recursive: true })
  mkdirSync(path.join(dist, 'server'), { recursive: true })
  writeFileSync(path.join(dist, 'client', 'index.html'), '<html><head></head><body><div id="app"></div></body></html>')
  writeFileSync(path.join(dist, 'client', 'about', 'index.html'), 'about page')
  writeFileSync(
    path.join(dist, 'server', 'entry-server.js'),
    `export async function callServerFunction(request) {
      if (!new URL(request.url).pathname.startsWith('/_keeno/fn/')) return null
      return new Response('called ' + (await request.text()))
    }`,
  )
  const handler = createHandler({ dist })

  test('answers server function calls', async () => {
    const res = await handler.fetch(new Request('http://localhost/_keeno/fn/a/0', { method: 'POST', body: '[1]' }))
    expect(await res.text()).toBe('called [1]')
  })

  test('without server rendering: prerendered pages, else the app shell', async () => {
    expect(await (await handler.fetch(new Request('http://localhost/about'))).text()).toBe('about page')
    expect(await (await handler.fetch(new Request('http://localhost/anything'))).text()).toContain('<div id="app">')
    expect((await handler.fetch(new Request('http://localhost/about', { method: 'POST' }))).status).toBe(405)
  })

  test('a 404.html answers missing pages when there is one', async () => {
    writeFileSync(path.join(dist, 'client', '404.html'), 'not found')
    const res = await createHandler({ dist }).fetch(new Request('http://localhost/missing'))
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('not found')
  })
})

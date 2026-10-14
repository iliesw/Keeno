import { describe, expect, test } from 'bun:test'
import { compile, hash, transformServerFunctions } from '../src/index'

const component = `<script lang="ts">
  import { db } from './db'
  import { shared, onlyServer } from './util'
  import './side-effect.css'
  const { params } = props<{ params: { id: string } }>()
  const getPost = server(async (id: string) => db.posts.find(onlyServer(id)))
  const like = server(async (id: string) => {
    const inner = (x: string) => x + '!'
    return db.posts.like(inner(id))
  })
  const post = derived(() => getPost(params.id))
  const n = shared(1)
</script>
<h1>{post.title} {n}</h1>`

describe('server()', () => {
  test('the browser build has stubs, without what only the functions used', () => {
    const { js, serverFunctions } = compile(component, { filename: 'src/Post.kn' })
    const id = hash('src/Post.kn')
    expect(serverFunctions).toBe(2)
    expect(js).toContain(`server("${id}/0")`)
    expect(js).toContain(`server("${id}/1")`)
    expect(js).not.toContain('db')
    expect(js).not.toContain('onlyServer')
    expect(js).toContain(`import { shared } from './util'`)
    expect(js).toContain(`import './side-effect.css'`)
    expect(js).toMatch(/import \{[^}]*\bserver\b[^}]*\} from "@inflector\/keeno"/)
    expect(js).not.toContain('$$serverFns')
  })

  test('the server build hoists the functions and exports them by index', () => {
    const { js } = compile(component, { filename: 'src/Post.kn', ssr: true })
    const id = hash('src/Post.kn')
    expect(js).toContain('const $$server0 = async (id: string) => db.posts.find(onlyServer(id))')
    expect(js).toContain(`server($$server0, "${id}/0")`)
    expect(js).toContain(`server($$server1, "${id}/1")`)
    expect(js).toMatch(/export const \$\$serverFns = \{\s*0: \$\$server0,\s*1: \$\$server1\s*\}/)
    expect(js).toContain(`import { db } from './db'`)
  })

  test('using a variable of the component is an error that names it', () => {
    const src = `<script>\n  const count = state(1)\n  const save = server(async () => count + 1)\n</script>\n<p />`
    expect(() => compile(src, { filename: 'a.kn' })).toThrow("server() can't use `count`")
    try {
      compile(src, { filename: 'a.kn' })
    } catch (err: any) {
      expect(err.loc.line).toBe(3)
    }
  })

  test('server() takes one function', () => {
    expect(() => compile(`<script>const f = server(123)</script><p />`, { filename: 'a.kn' })).toThrow('server() takes one function')
  })

  test('a local function named server is left alone', () => {
    const { js, serverFunctions } = compile(`<script>const server = (f: any) => f\nconst g = server(() => 1)</script><p />`, {
      filename: 'a.kn',
    })
    expect(serverFunctions).toBe(0)
    expect(js).toContain('server(() => 1)')
  })

  test('.ts modules: stubs in the browser, functions on the server; server must be imported', () => {
    const code = [
      `import { server } from '@inflector/keeno'`,
      `import { db } from './db'`,
      `const table = db.table('users')`,
      `export const getUser = server(async (id: string) => table.find(id))`,
      `export const local = 1`,
    ].join('\n')
    const client = transformServerFunctions(code, { filename: 'src/users.ts', id: 'abc', ssr: false })!.code
    expect(client).toContain(`export const getUser = server("abc/0")`)
    expect(client).not.toContain('db')
    expect(client).not.toContain('table')
    expect(client).toContain('export const local = 1')
    const ssr = transformServerFunctions(code, { filename: 'src/users.ts', id: 'abc', ssr: true })!.code
    expect(ssr).toContain('const $$server0 = async (id: string) => table.find(id)')
    expect(ssr).toContain('export const getUser = server($$server0, "abc/0")')
    expect(ssr).toContain('export const $$serverFns')
    expect(transformServerFunctions(`const r = server(() => 1)`, { filename: 'x.ts', id: 'x', ssr: false })).toBeNull()
  })
})

// Drive the real language server over LSP (as an editor would) against the todo example.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { startLanguageServer, type LanguageServerHandle } from '@volar/test-utils'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const repo = path.resolve(import.meta.dir, '../../..')
const exampleSrc = path.join(repo, 'examples/todo/src')
const tsdk = path.join(repo, 'node_modules/typescript/lib')
const serverModule = path.resolve(import.meta.dir, '../src/server.ts')

let server: LanguageServerHandle

beforeAll(async () => {
  server = startLanguageServer(serverModule, repo)
  // Pushed diagnostics are pulled explicitly below; without a handler test-utils logs each one.
  server.connection.onNotification('textDocument/publishDiagnostics', () => {})
  // Only surface server errors (type 1), not informational capability messages.
  server.connection.onNotification('window/logMessage', (e: { type: number; message: string }) => {
    if (e.type === 1) console.error(e.message)
  })
  await server.initialize(pathToFileURL(repo).href, { typescript: { tsdk } })
}, 30_000)

afterAll(async () => {
  // test-utils logs the connection's close event.
  const log = console.log
  console.log = () => {}
  try {
    await server.shutdown()
    server.process.kill()
    await new Promise((r) => setTimeout(r, 50))
  } finally {
    console.log = log
  }
})

let n = 0
/** Open an in-memory .kn document next to the example (so `@inflector/keeno` resolves). Returns its URI and a position helper. */
async function open(content: string) {
  const uri = pathToFileURL(path.join(exampleSrc, `__test${n++}.kn`)).href
  const doc = await server.openInMemoryDocument(uri, 'keeno', content.replace('|', ''))
  const at = content.indexOf('|')
  return { uri, pos: doc.positionAt(at < 0 ? 0 : at) }
}

async function errors(uri: string) {
  const report = (await server.sendDocumentDiagnosticRequest(uri)) as any
  return (report.items ?? []).filter((d: any) => d.severity === 1).map((d: any) => d.message as string)
}

async function labels(uri: string, pos: { line: number; character: number }) {
  const list = await server.sendCompletionRequest(uri, pos)
  return (list?.items ?? []).map((i) => i.label.replace(/\?$/, ''))
}

describe('diagnostics', () => {
  test('the todo example has no type errors', async () => {
    for (const file of ['pages/index.kn', 'pages/_layout.kn', 'pages/about.kn', 'pages/_404.kn', 'TodoItem.kn']) {
      const doc = await server.openTextDocument(path.join(exampleSrc, file), 'keeno')
      expect({ file, errors: await errors(doc.uri) }).toEqual({ file, errors: [] })
    }
  }, 30_000)

  test('state reads type as the value; set() is checked', async () => {
    const { uri } = await open(`<script lang="ts">
  const count = state(0)
  const doubled: number = count * 2
  count.set('nope')
</script>
<p>{count + 1}</p>`)
    const errs = await errors(uri)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toMatch(/'string' is not assignable to parameter of type 'number'/)
  })

  test('plain <script> (JS) gets completions but no type errors', async () => {
    const { uri } = await open('<script>const a = state(1)\nfunction f(x) { return x }</script>\n<p>{a}</p>')
    expect(await errors(uri)).toEqual([])
  })

  test('unknown identifiers in markup are reported at the right place', async () => {
    const { uri } = await open('<script lang="ts">const a = state(1)</script>\n<p>{b}</p>')
    const report = (await server.sendDocumentDiagnosticRequest(uri)) as any
    const d = report.items.find((x: any) => /Cannot find name 'b'/.test(x.message))
    expect(d.range.start).toEqual({ line: 1, character: 4 })
  })

  test('reassigning a state is an error', async () => {
    const { uri } = await open('<script lang="ts">const a = state(1)\na = 2</script>')
    expect((await errors(uri)).join()).toMatch(/constant/)
  })
})

describe('completions', () => {
  test('state members: reserved methods plus the value\'s own members', async () => {
    const { uri, pos } = await open(`<script lang="ts">
  const name = state('ada')
  name.|
</script>`)
    const items = await labels(uri, pos)
    for (const l of ['set', 'get', 'peek', 'onUpdate', 'toUpperCase', 'length']) expect(items).toContain(l)
  })

  test('keeno APIs are available without imports', async () => {
    const { uri, pos } = await open('<script lang="ts">\n  upd|\n</script>')
    expect(await labels(uri, pos)).toContain('update')
  })

  test('script bindings are visible in markup expressions', async () => {
    const { uri, pos } = await open('<script lang="ts">const todos = state([{ id: 1, text: "x" }])</script>\n<p>{todos[0].|}</p>')
    const items = await labels(uri, pos)
    expect(items).toContain('id')
    expect(items).toContain('text')
  })

  test('HTML tags, attributes and events in markup', async () => {
    const tag = await open('<script></script>\n<but|')
    expect(await labels(tag.uri, tag.pos)).toContain('button')
    const attr = await open('<script></script>\n<input pla| />')
    expect(await labels(attr.uri, attr.pos)).toContain('placeholder')
    const ev = await open('<script></script>\n<button onCl| />')
    expect(await labels(ev.uri, ev.pos)).toContain('onClick')
  })

  test('event handlers get typed events', async () => {
    const { uri, pos } = await open('<script lang="ts"></script>\n<input onKeyDown={(e) => e.|} />')
    expect(await labels(uri, pos)).toContain('key')
  })

  test('CSS inside <style>', async () => {
    const { uri, pos } = await open('<p>x</p>\n<style>\n  p { col| }\n</style>')
    expect(await labels(uri, pos)).toContain('color')
  })

  test('Tailwind directives in <style> are known and complete', async () => {
    const valid = await open(
      '<p>x</p>\n<style>\n  @reference "tailwindcss";\n  p { @apply px-4 hover:bg-red-500/50; @variant dark { color: red } }\n  @utility tab-4 { tab-size: 4 }\n  @theme { --color-brand: red }\n</style>',
    )
    const report = (await server.sendDocumentDiagnosticRequest(valid.uri)) as any
    expect((report.items ?? []).map((d: any) => d.message)).toEqual([])
    const { uri, pos } = await open('<p>x</p>\n<style>\n  @|\n</style>')
    expect(await labels(uri, pos)).toEqual(expect.arrayContaining(['@apply', '@theme', '@utility', '@variant']))
  })
})

describe('derived, state options, spread, class arrays', () => {
  test('all new features type-check cleanly', async () => {
    const { uri } = await open(`<script lang="ts">
  const qty = state(2)
  const total = derived(() => qty * 3)
  const doubled: number = total * 2
  const q = state('', { debounce: 300, url: 'q' })
  const n = state(5, { validate: (v, prev) => (Number.isNaN(v) ? prev : Math.min(v, 10)), history: 20, persist: 'n' })
  const obj = state({ a: 1 }, { equals: (x, y) => x.a === y.a })
  const attrs = { placeholder: 'x' }
  const active = state(false)
  n.undo()
</script>
<input {...attrs} bind:value={q} />
<button class={['btn', active && 'on']} disabled={!n.canUndo}>{total}</button>`)
    expect(await errors(uri)).toEqual([])
  })

  test('derived is read-only', async () => {
    const { uri } = await open('<script lang="ts">const d = derived(() => 1)\nd.set(2)</script>')
    expect((await errors(uri)).join()).toMatch(/Property 'set' does not exist/)
  })

  test('state options are checked against the value type', async () => {
    const { uri } = await open('<script lang="ts">const n = state(1, { validate: (v) => "nope" })</script>')
    expect((await errors(uri)).join()).toMatch(/not assignable to type 'number'/)
  })

  test('history members complete', async () => {
    const { uri, pos } = await open('<script lang="ts">\nconst t = state("", { history: 5 })\nt.|\n</script>')
    const items = await labels(uri, pos)
    for (const l of ['undo', 'redo', 'canUndo', 'canRedo']) expect(items).toContain(l)
  })
})

describe('typed props', () => {
  const item = (attrs: string) =>
    `<script lang="ts">\n  import TodoItem from './TodoItem.kn'\n  const t = { id: 1, text: 'x', done: false }\n</script>\n<ul><TodoItem ${attrs} /></ul>`

  test('a missing required prop is an error', async () => {
    const { uri } = await open(item('onToggle={() => {}} onRemove={() => {}}'))
    expect((await errors(uri)).join()).toMatch(/Property 'todo' is missing/)
  })

  test('a prop of the wrong type is an error', async () => {
    const { uri } = await open(item("todo={t} onToggle={(id: string) => {}} onRemove={() => {}}"))
    expect((await errors(uri)).join()).toMatch(/'number' is not assignable to type 'string'/)
  })

  test('prop names complete on the child tag', async () => {
    const { uri, pos } = await open(item('todo={t} |'))
    const items = await labels(uri, pos)
    for (const l of ['onToggle', 'onRemove']) expect(items).toContain(l)
  })

  test('props are typed inside the component; children is a function', async () => {
    const { uri } = await open(`<script lang="ts">
  import type { Children } from '@inflector/keeno'
  const { title, children } = props<{ title: string; children?: Children }>()
  const n: number = title
  children?.()
</script>
<h2>{title}</h2>{children}`)
    const errs = await errors(uri)
    expect(errs).toHaveLength(1)
    expect(errs[0]).toMatch(/'string' is not assignable to type 'number'/)
  })

  test('a parent passes children as nested markup', async () => {
    const card = await open(`<script lang="ts">
  import type { Children } from '@inflector/keeno'
  const { title, children } = props<{ title: string; children: Children }>()
</script>
<section><h2>{title}</h2>{children}</section>`)
    const name = path.basename(new URL(card.uri).pathname)
    const ok = await open(`<script lang="ts">import Card from './${name}'</script>\n<Card title="a"><p>one</p><p>two</p></Card>`)
    expect(await errors(ok.uri)).toEqual([])
    const missing = await open(`<script lang="ts">import Card from './${name}'</script>\n<Card title="a" />`)
    expect((await errors(missing.uri)).join()).toMatch(/children/)
  })

  test('without a type argument props stay untyped', async () => {
    const { uri } = await open(`<script lang="ts">\n  const { a } = props()\n  const n: number = a\n</script>`)
    expect(await errors(uri)).toEqual([])
  })
})

describe('hover and navigation', () => {
  test('hover shows the state type', async () => {
    const { uri, pos } = await open('<script lang="ts">const co|unt = state(0)</script>')
    const hover = await server.sendHoverRequest(uri, pos)
    expect(JSON.stringify(hover?.contents)).toMatch(/KnState<number>/)
  })

  test('go to definition from markup into the script', async () => {
    const { uri, pos } = await open('<script lang="ts">\nconst count = state(0)\n</script>\n<p>{cou|nt}</p>')
    const defs = (await server.sendDefinitionRequest(uri, pos)) as any[]
    const target = defs[0].targetSelectionRange ?? defs[0].range
    expect(target.start.line).toBe(1)
  })
})

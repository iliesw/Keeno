// Drive the real language server over LSP (as an editor would) against the todo example.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { startLanguageServer, type LanguageServerHandle } from '@volar/test-utils'
import ts from 'typescript'
import { componentName, generateScript } from '../src/virtualCode'
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
async function open(content: string, file = `__test${n++}.kn`) {
  const uri = pathToFileURL(path.join(exampleSrc, file)).href
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

describe('component names', () => {
  test('the default export is named after the file', () => {
    expect(componentName('/src/TodoItem.kn')).toBe('TodoItem')
    expect(componentName('C:\\src\\todo-item.kn')).toBe('TodoItem')
    expect(componentName('/src/cards/index.kn')).toBe('Cards')
    expect(componentName('/src/pages/_layout.kn')).toBe('Layout')
    expect(componentName('/src/pages/[id].kn')).toBe('Id')
    expect(componentName('/src/404.kn')).toBe('__KeenoComponent')
    expect(componentName(undefined)).toBe('__KeenoComponent')
  })

  test('falls back when the code uses the name, but not for strings, comments or properties', () => {
    const exported = (source: string, file: string) =>
      /export default function (\w+)/.exec(generateScript(ts, source, undefined, file).text)![1]
    expect(exported("<script lang=\"ts\">import { Icon } from 'lucide'</script>", '/src/Icon.kn')).toBe('__KeenoComponent')
    expect(exported('<p>{Date.now()}</p>', '/src/Date.kn')).toBe('__KeenoComponent')
    const typed = '<script lang="ts">\n  const { a } = props<{ a: string }>()\n  console.log(`[Item] ${a}`) // Item\n</script>\n<p data-x={a.Item}>Item</p>'
    expect(exported(typed, '/src/Item.kn')).toBe('Item')
  })

  test('a component file completes as a tag by its name, with an auto-import', async () => {
    // An on-disk page (in-memory test files sit outside the example's tsconfig project) that
    // doesn't import TodoItem.kn.
    // The import goes on the line after the script's last import, or on the script's first line.
    const cases: [string, number][] = [
      ["import { Link } from '@inflector/keeno-router'\n  console.log(Link)", 2],
      ['const a = 1', 1],
    ]
    for (const [script, line] of cases) {
      const { uri, pos } = await open(`<script lang="ts">\n  ${script}\n</script>\n<div>\n  <TodoIt|\n</div>`, 'pages/about.kn')
      const list = await server.sendCompletionRequest(uri, pos)
      const item = list?.items.find((i) => i.label === 'TodoItem')
      expect(item).toBeDefined()
      const [edit] = (await server.sendCompletionResolveRequest(item!)).additionalTextEdits ?? []
      expect(edit?.newText).toMatch(/import TodoItem from '\.\.\/TodoItem\.kn'/)
      expect(edit?.range.start).toEqual({ line, character: 0 })
    }
  })

  test('a component named like a global it uses still type-checks', async () => {
    const { uri } = await open('<script lang="ts">\n  const t: number = Date.now()\n</script>\n<p>{t}</p>', 'Date.kn')
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

  test('use: directives: definition and hover on the name, errors on the value', async () => {
    const src =
      '<script lang="ts">\nconst tip = (el: HTMLElement, text: string) => { el.title = text }\n</script>\n<button use:ti|p={"hi"}>x</button>\n<p use:tip={1}>y</p>'
    const { uri, pos } = await open(src)
    const defs = (await server.sendDefinitionRequest(uri, pos)) as any[]
    expect((defs[0].targetSelectionRange ?? defs[0].range).start.line).toBe(1)
    const hover = await server.sendHoverRequest(uri, pos)
    expect(JSON.stringify(hover?.contents)).toMatch(/text: string/)
    expect(await errors(uri)).toEqual(["Argument of type 'number' is not assignable to parameter of type 'string'."])
  })
})

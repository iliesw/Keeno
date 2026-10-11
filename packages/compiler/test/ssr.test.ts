// Server rendering parity: each compiled fixture renders the same markup with renderToString
// (linkedom) as with mount() in the browser DOM, before any init/update callback runs.
import { plugin } from 'bun'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createComponent } from '@inflector/keeno/internal'
import { renderToString } from '@inflector/keeno/server'
import { Owner, runWithOwner } from '../../keeno/src/signal'
import { insert } from '../../keeno/src/dom'
import { compile } from '../src/index'

beforeAll(() => {
  plugin({
    name: 'keeno-ssr-test',
    setup(build) {
      build.onLoad({ filter: /\.kn$/ }, async ({ path }) => ({
        contents: compile(await Bun.file(path).text(), { filename: path }).js,
        loader: 'ts',
      }))
    },
  })
})

let roots: Owner[] = []
afterEach(() => {
  for (const r of roots) r.dispose()
  roots = []
})

/** Client render without flushing mount jobs, so init/update haven't run (as on the server). */
function clientHtml(Comp: any, props: Record<string, any>) {
  const root = new Owner(null)
  roots.push(root)
  const el = document.createElement('div')
  runWithOwner(root, () => insert(el, () => createComponent(Comp, props)))
  return el.innerHTML
}

/**
 * Canonical form of some HTML, parsed by the browser DOM: attributes sorted, tag names as the
 * HTML parser fixes them. `value` attributes are dropped: the server writes the input's value
 * as an attribute (so it shows before hydration), while the client sets the property.
 */
function normalize(html: string): string {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return JSON.stringify((n as Text).data)
    if (n.nodeType === 8) return '<!---->'
    if (n.nodeType !== 1) return ''
    const el = n as Element
    const attrs = [...el.attributes]
      .filter((a) => a.name !== 'value')
      .map((a) => `${a.name}="${a.value}"`)
      .sort()
    return `<${el.tagName.toLowerCase()} ${attrs.join(' ')}>${[...el.childNodes].map(walk).join('')}</>`
  }
  return [...tpl.content.childNodes].map(walk).join('')
}

const noop = () => {}
const cases: [string, Record<string, any>][] = [
  ['Counter', { title: 'Count', onSave: noop, log: noop }],
  ['Todos', { log: noop }],
  ['Features', {}],
  ['WithCard', {}],
  ['Chart', {}],
  ['Table', {}],
  ['Row', { name: 'a & b', qty: 2 }],
]

describe('renderToString matches the client DOM', () => {
  test('input values are written as attributes', async () => {
    const Comp = (await import('./fixtures/Features.kn')).default
    expect(await renderToString(Comp)).toContain('value="a"')
  })

  for (const [name, props] of cases) {
    test(name, async () => {
      const Comp = (await import(`./fixtures/${name}.kn`)).default
      const server = await renderToString(Comp, props)
      expect(server.length).toBeGreaterThan(0)
      expect(normalize(server)).toBe(normalize(clientHtml(Comp, props)))
    })
  }
})

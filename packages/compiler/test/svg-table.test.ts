// SVG namespace and table content-model handling: codegen snapshots, compile errors, and
// rendering in happy-dom (Playwright covers real-browser parsing in e2e/svg-table.e2e.ts).
import { plugin } from 'bun'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { mount, type MountedApp } from '@inflector/keeno'
import { compile } from '../src/index'

const js = (markup: string, script = '') => compile(`<script lang="ts">\n${script}\n</script>\n${markup}`, { filename: 'src/Test.kn' }).js
const SVG_NS = 'http://www.w3.org/2000/svg'
const HTML_NS = 'http://www.w3.org/1999/xhtml'

describe('SVG codegen', () => {
  test('an SVG-only root is created inside an <svg> wrapper', () => {
    const out = js('<g class="a"><circle r={r} /><text>hi</text></g>', 'const r = state(1)')
    expect(out).toContain('_$template("<g class=\\"a\\"><circle></circle><text>hi</text></g>", true)')
    expect(out).toMatchSnapshot()
  })

  test('<svg> itself and HTML roots are not wrapped', () => {
    const out = js('<svg><circle /></svg>\n<div />')
    expect(out).toContain('_$template("<svg><circle></circle></svg>")')
    expect(out).toContain('_$template("<div></div>")')
  })

  test('nested roots inside <svg> are SVG, even for tags HTML also has', () => {
    const out = js('<svg>{show && <a href="#"><circle /></a>}<Layer><a /></Layer></svg>', 'const show = state(true)')
    expect(out).toContain('_$template("<a href=\\"#\\"><circle></circle></a>", true)')
    expect(out).toContain('_$template("<a></a>", true)')
    expect(out).toMatchSnapshot()
  })

  test('<foreignObject> switches back to HTML', () => {
    const out = js('<svg><foreignObject>{show && <a>link</a>}<Box><p /></Box></foreignObject></svg>', 'const show = state(true)')
    expect(out).toContain('_$template("<a>link</a>")')
    expect(out).toContain('_$template("<p></p>")')
    expect(out).not.toContain(', true)')
  })

  test('the same html as SVG and as HTML gets two templates', () => {
    const out = js('<div>{x && <a />}</div>\n<svg>{x && <a />}</svg>', 'const x = state(true)')
    expect(out).toContain('_$template("<a></a>")')
    expect(out).toContain('_$template("<a></a>", true)')
  })
})

describe('table codegen', () => {
  test('a well-formed table compiles to straight firstChild/nextSibling paths', () => {
    const out = js(
      '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>{a}</td></tr></tbody></table>',
      'const a = state(1)',
    )
    expect(out).toContain('<table><thead><tr><th>A</th></tr></thead><tbody><tr><td></td></tr></tbody></table>')
    expect(out).toMatchSnapshot()
  })

  test('<tr> and <td> roots compile without wrappers', () => {
    expect(js('<tr><td>a</td></tr>')).toContain('_$template("<tr><td>a</td></tr>")')
    expect(js('<td>a</td>')).toContain('_$template("<td>a</td>")')
  })

  test('<tr> directly in <table> is an error that suggests <tbody>', () => {
    expect(() => js('<table><tr><td>a</td></tr></table>')).toThrow(
      '<tr> cannot be a direct child of <table>: the HTML parser would insert a <tbody> and break the template. Wrap it in <tbody> (or <thead>/<tfoot>).',
    )
  })

  test('other implied wrappers and foster-parented content are errors', () => {
    expect(() => js('<tbody><td /></tbody>')).toThrow(/<td> cannot be a direct child of <tbody>.*Wrap it in <tr>/)
    expect(() => js('<table><col /></table>')).toThrow(/Wrap it in <colgroup>/)
    expect(() => js('<table><div /></table>')).toThrow(/<div> cannot be a direct child of <table>.*Allowed: <caption>/)
    expect(() => js('<tr><span /></tr>')).toThrow(/<span> cannot be a direct child of <tr>/)
    expect(() => js('<tr>oops</tr>')).toThrow(/Text cannot be a direct child of <tr>/)
  })

  test('errors carry the location of the offending element', () => {
    try {
      js('<table>\n  <tr />\n</table>')
      throw new Error('expected a compile error')
    } catch (e: any) {
      expect(e.loc).toEqual({ line: 5, column: 2 })
    }
  })

  test('expressions, components, whitespace and <template> are allowed in table elements', () => {
    expect(() => js('<table>{rows}<Rows /></table>', 'const rows = state([])')).not.toThrow()
    expect(() => js('<tr>{" "}<template /></tr>')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// rendering (happy-dom)

beforeAll(() => {
  plugin({
    name: 'keeno-test-svg-table',
    setup(build) {
      build.onLoad({ filter: /\.kn$/ }, async ({ path }) => ({
        contents: compile(await Bun.file(path).text(), { filename: path }).js,
        loader: 'ts',
      }))
    },
  })
})

const tick = () => new Promise((r) => setTimeout(r, 0))
let app: MountedApp | undefined
afterEach(() => {
  app?.destroy()
  app = undefined
  document.body.innerHTML = ''
})

async function render(fixture: string) {
  const Comp = (await import(`./fixtures/${fixture}.kn`)).default
  const target = document.createElement('div')
  document.body.appendChild(target)
  app = mount(Comp, target)
  return target
}

describe('SVG rendering', () => {
  test('component roots and conditional children get the SVG namespace', async () => {
    const el = await render('Chart')
    const dots = [...el.querySelectorAll('circle')]
    expect(dots).toHaveLength(2)
    for (const d of dots) expect(d.namespaceURI).toBe(SVG_NS)
    expect(dots[1].getAttribute('cx')).toBe('30')
    expect(el.querySelector('line')!.namespaceURI).toBe(SVG_NS)
    expect(el.querySelector('text')!.textContent).toBe('Chart')
    expect(el.querySelector('foreignObject p')!.namespaceURI).toBe(HTML_NS)

    ;(el.querySelector('.add') as HTMLElement).click()
    await tick()
    const added = el.querySelectorAll('circle')[2]
    expect(added.namespaceURI).toBe(SVG_NS)
    expect(added.getAttribute('cy')).toBe('60')

    ;(el.querySelector('.axis-toggle') as HTMLElement).click()
    await tick()
    expect(el.querySelector('line')).toBeNull()
    ;(el.querySelector('.axis-toggle') as HTMLElement).click()
    await tick()
    expect(el.querySelector('line')!.namespaceURI).toBe(SVG_NS)
  })
})

describe('table rendering', () => {
  test('rows render in <tbody> and dynamic cells update in place', async () => {
    const el = await render('Table')
    const rows = el.querySelectorAll('tbody > tr.row')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toBe('apples3')
    expect(el.querySelector('tfoot .total')!.textContent).toBe('8')
    ;(el.querySelector('.more') as HTMLElement).click()
    await tick()
    expect(el.querySelector('tbody > tr.row')).toBe(rows[0])
    expect(rows[0].querySelector('.qty')!.textContent).toBe('4')
    expect(el.querySelector('tfoot .total')!.textContent).toBe('9')
  })
})

import { describe, expect, test } from 'bun:test'
import { compile } from '../src/index'
import { split } from '../src/split'

describe('split', () => {
  test('</script> inside strings, template literals and comments does not end the script', () => {
    const src = "<script>\n  const a = '</script>'\n  const b = `${ { x: '</script>' }.x }`\n  // </script>\n</script>\n<p>{a}{b}</p>"
    const { script, markup } = split(src)
    expect(script!.content).toContain('// </script>')
    expect(markup.trim()).toBe('<p>{a}{b}</p>')
  })

  test('<style> inside an inline <svg> and data <script>s stay in the markup', () => {
    const src = '<svg><style>{`.a{}`}</style></svg>\n<script type="application/ld+json">{"{}"}</script>\n<style>p{}</style>'
    const { script, style, markup } = split(src)
    expect(script).toBeNull()
    expect(style!.content).toBe('p{}')
    expect(markup).toContain('<svg><style>')
    expect(markup).toContain('application/ld+json')
  })
})

describe('props', () => {
  test('a default that creates an object is evaluated once', () => {
    const { js } = compile('<script>\n  const { items = [], n = 1 } = props()\n</script>\n<p>{items.length}{n}</p>', { filename: 'A.kn' })
    expect(js).toContain('const _itemsDefault = []')
    expect(js).toContain('$$props.items ?? _itemsDefault')
    expect(js).toContain('$$props.n ?? 1')
  })
})

describe('events', () => {
  test('onDoubleClick listens to dblclick', () => {
    const { js } = compile('<button onDoubleClick={() => {}}>x</button>', { filename: 'A.kn' })
    expect(js).toContain('"dblclick"')
  })
})

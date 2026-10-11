import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import lux from '../src/index'

const root = path.resolve(import.meta.dir, '../../../examples/todo')
const file = path.join(root, 'src/TodoItem.lx').replaceAll('\\', '/')
const source = await Bun.file(file).text()

function setup(command: 'serve' | 'build') {
  const plugin = lux() as any
  plugin.configResolved({ root, command, isProduction: command === 'build' })
  return plugin
}

describe('@inflector/vite-plugin-lux', () => {
  test('transforms .lx to JS without TypeScript, importing the scoped CSS', async () => {
    const out = await setup('build').transform(source, file)
    expect(out.code).toContain(`import "${file}?lux&type=style.css"`)
    expect(out.code).toContain('from "@inflector/lux/internal"')
    expect(out.code).not.toContain('import.meta.hot')
    expect(out.code).not.toContain('__LUX_DEV__')
    expect(out.map.mappings.length).toBeGreaterThan(0)
  })

  test('in dev, exports a hot wrapper and self-accepts', async () => {
    const out = await setup('serve').transform(source, file)
    expect(out.code).toContain('export default _$hot(TodoItem, "src/TodoItem.lx")')
    expect(out.code).toContain('import.meta.hot.accept()')
    expect(out.code).toContain('globalThis.__LUX_DEV__ = true')
  })

  test('serves the scoped CSS from the virtual module', () => {
    const css = setup('serve').load(`${file}?lux&type=style.css`)
    expect(css).toMatch(/li\.lux-[0-9a-f]{8} \{/)
  })

  test('ignores other files and queries', async () => {
    const p = setup('serve')
    expect(await p.transform('x', '/a/b.ts')).toBeUndefined()
    expect(await p.transform('x', `${file}?lux&type=style.css`)).toBeUndefined()
    expect(p.load('/a/b.ts')).toBeUndefined()
  })

  test('compile errors carry the file and location', async () => {
    const err = await setup('build')
      .transform('<script>let a = state(1)\na = 2</script>', file)
      .catch((e: any) => e)
    expect(err.message).toMatch(/Cannot reassign state "a"/)
    expect(err.id).toBe(file)
  })
})

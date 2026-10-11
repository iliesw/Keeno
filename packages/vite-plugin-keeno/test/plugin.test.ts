import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import keeno from '../src/index'

const root = path.resolve(import.meta.dir, '../../../examples/todo')
const file = path.join(root, 'src/TodoItem.kn').replaceAll('\\', '/')
const source = await Bun.file(file).text()

function setup(command: 'serve' | 'build') {
  const plugin = keeno() as any
  plugin.configResolved({ root, command, isProduction: command === 'build' })
  return plugin
}

describe('@inflector/vite-plugin-keeno', () => {
  test('transforms .kn to JS without TypeScript, importing the scoped CSS', async () => {
    const out = await setup('build').transform(source, file)
    expect(out.code).toContain(`import "${file}?keeno&type=style&lang.css"`)
    expect(out.code).toContain('from "@inflector/keeno/internal"')
    expect(out.code).not.toContain('import.meta.hot')
    expect(out.code).not.toContain('__KEENO_DEV__')
    expect(out.map.mappings.length).toBeGreaterThan(0)
  })

  test('in dev, exports a hot wrapper and self-accepts', async () => {
    const out = await setup('serve').transform(source, file)
    expect(out.code).toContain('export default _$hot(TodoItem, "src/TodoItem.kn")')
    expect(out.code).toContain('import.meta.hot.accept()')
    expect(out.code).toContain('globalThis.__KEENO_DEV__ = true')
  })

  test('serves the scoped CSS from the virtual module', () => {
    const css = setup('serve').load(`${file}?keeno&type=style&lang.css`)
    expect(css).toMatch(/li\.keeno-[0-9a-f]{8} \{/)
  })

  test('ignores other files and queries', async () => {
    const p = setup('serve')
    expect(await p.transform('x', '/a/b.ts')).toBeUndefined()
    expect(await p.transform('x', `${file}?keeno&type=style&lang.css`)).toBeUndefined()
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

describe('Tailwind', () => {
  const twRoot = path.resolve(import.meta.dir, '../../../examples/tailwind')
  const posix = (p: string) => p.replaceAll(path.sep, '/')
  const app = posix(path.join(twRoot, 'src/App.kn'))
  const entry = posix(path.join(twRoot, 'src/app.css'))
  const css = (options: Parameters<typeof keeno>[0], plugins: { name: string }[], id = app, root = twRoot) => {
    const p = keeno(options) as any
    p.configResolved({ root, command: 'build', isProduction: true, plugins })
    return p.load(`${id}?keeno&type=style&lang.css`) as string
  }
  const withTailwind = [{ name: '@tailwindcss/vite:scan' }]

  test('with @tailwindcss/vite, styles using Tailwind @reference the project stylesheet that imports it', () => {
    expect(css({}, withTailwind).startsWith(`@reference "${entry}";\n`)).toBe(true)
  })

  test('nothing is added without @tailwindcss/vite, with tailwind: false, or to styles that do not use Tailwind', () => {
    expect(css({}, [])).not.toMatch(/^@reference/m)
    expect(css({ tailwind: false }, withTailwind)).not.toMatch(/^@reference/m)
    expect(css({}, withTailwind, file, root)).not.toMatch(/^@reference/m)
  })

  test('the reference can be set explicitly', () => {
    const out = css({ tailwind: { reference: 'styles/theme.css' } }, [])
    expect(out.startsWith(`@reference "${posix(path.join(twRoot, 'styles/theme.css'))}";`)).toBe(true)
  })

  test('vite build compiles @apply, @variant and --spacing() in scoped component styles', async () => {
    const { build } = await import('vite')
    const tailwindcss = (await import('@tailwindcss/vite')).default
    const out: any = await build({
      root: twRoot,
      configFile: false,
      logLevel: 'silent',
      plugins: [keeno(), tailwindcss()],
      resolve: { conditions: ['keeno-source'] },
      build: { write: false },
    })
    const assets = (Array.isArray(out) ? out[0] : out).output
    const built = assets.find((a: any) => a.fileName.endsWith('.css')).source as string
    expect(built).not.toMatch(/@apply|@variant|@reference|--spacing\(/)
    // The custom theme color from src/app.css reaches the component's scoped `.btn`.
    expect(built).toMatch(/\.btn\.keeno-[0-9a-f]{8}\{[^}]*background-color:var\(--color-brand/)
    // Utilities written in .kn markup are generated.
    expect(built).toContain('.text-amber-600')
  }, 60_000)
})

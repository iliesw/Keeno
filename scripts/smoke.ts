// Consumer smoke test: pack every publishable package, install the tarballs into a fresh project
// with npm, then build it with Vite, type-check it with keeno-check and server-render it, all on
// Node (not Bun). Catches packaging mistakes (missing files, unresolved `workspace:` ranges,
// wrong exports) and incompatibilities with a Vite major.
//
//   bun run scripts/smoke.ts [--vite=8] [--keep]
//
// Run `bun run build` first.
import { $ } from 'bun'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const viteMajor = process.argv.find((a) => a.startsWith('--vite='))?.slice(7) ?? '8'
const keep = process.argv.includes('--keep')
const work = path.join(tmpdir(), `keeno-smoke-vite${viteMajor}`)
const tarballs = path.join(work, 'tarballs')
const app = path.join(work, 'app')

const packages = ['keeno', 'router', 'compiler', 'vite-plugin-keeno', 'language-server', 'keeno-check']

function step(name: string) {
  console.log(`\n[smoke] ${name}`)
}

function fail(message: string): never {
  console.error(`[smoke] FAILED: ${message}`)
  process.exit(1)
}

rmSync(work, { recursive: true, force: true })
mkdirSync(tarballs, { recursive: true })
mkdirSync(path.join(app, 'src'), { recursive: true })

step('pack')
const deps: Record<string, string> = {}
for (const dir of packages) {
  const cwd = path.join(root, 'packages', dir)
  const pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'))
  if (!existsSync(path.join(cwd, 'dist'))) fail(`packages/${dir}/dist is missing: run \`bun run build\` first`)
  await $`bun pm pack --destination ${tarballs} --quiet`.cwd(cwd)
  const file = readdirSync(tarballs).find((f) => f.startsWith(pkg.name.replace('@', '').replace('/', '-') + '-'))
  if (!file) fail(`no tarball for ${pkg.name}`)
  deps[pkg.name] = `file:${path.join(tarballs, file).replace(/\\/g, '/')}`
}

step(`create app (vite@${viteMajor})`)
const files: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'keeno-smoke-app',
      private: true,
      type: 'module',
      dependencies: { '@inflector/keeno': deps['@inflector/keeno'], '@inflector/keeno-router': deps['@inflector/keeno-router'] },
      devDependencies: {
        '@inflector/vite-plugin-keeno': deps['@inflector/vite-plugin-keeno'],
        '@inflector/keeno-check': deps['@inflector/keeno-check'],
        // Transitive tarball dependencies must resolve to the local tarballs too.
        '@inflector/keeno-compiler': deps['@inflector/keeno-compiler'],
        '@inflector/keeno-language-server': deps['@inflector/keeno-language-server'],
        vite: `^${viteMajor}.0.0`,
        typescript: '^5.6.0',
        linkedom: '^0.18.0',
      },
      overrides: {
        '@inflector/keeno': deps['@inflector/keeno'],
        '@inflector/keeno-compiler': deps['@inflector/keeno-compiler'],
        '@inflector/keeno-language-server': deps['@inflector/keeno-language-server'],
      },
    },
    null,
    2,
  ),
  'vite.config.mjs': `import { defineConfig } from 'vite'
import keeno from '@inflector/vite-plugin-keeno'
export default defineConfig({ plugins: [keeno()] })
`,
  'tsconfig.json': JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      },
      include: ['src'],
    },
    null,
    2,
  ),
  'index.html': `<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>`,
  'src/env.d.ts': `declare module '*.kn' {
  const Component: import('@inflector/keeno').Component
  export default Component
}
`,
  'src/main.ts': `import { mount } from '@inflector/keeno'
import App from './App.kn'
mount(App, document.getElementById('app')!)
`,
  'src/Item.kn': `<script lang="ts">
  const { text, onRemove } = props<{ text: string; onRemove: () => void }>()
</script>

<li class="item">{text} <button onClick={onRemove}>x</button></li>

<style>
  .item { color: rebeccapurple }
</style>
`,
  'src/App.kn': `<script lang="ts">
  import { ErrorBoundary } from '@inflector/keeno'
  import { Link } from '@inflector/keeno-router'
  import Item from './Item.kn'
  const items = state<{ id: number; text: string }[]>([{ id: 1, text: 'first' }])
  const count = derived(() => items.length)
</script>

<h1>Smoke {count}</h1>
<ErrorBoundary fallback={(e) => <p>{String(e)}</p>}>
  <ul>{items.map((i) => <Item key={i.id} text={i.text} onRemove={() => items.set(items.filter((x) => x.id !== i.id))} />)}</ul>
</ErrorBoundary>
<Link href="/about">about</Link>

<style>
  h1 { font-weight: 300 }
</style>
`,
  'src/entry-server.ts': `import { renderToString } from '@inflector/keeno/server'
import App from './App.kn'
export const render = () => renderToString(App)
`,
  // Dev SSR: load the server entry through Vite, so the app and renderToString share one runtime.
  'ssr.mjs': `import { createServer } from 'vite'

const vite = await createServer({ configFile: 'vite.config.mjs', server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
let html
try {
  const { render } = await vite.ssrLoadModule('/src/entry-server.ts')
  html = await render()
} finally {
  await vite.close()
}
console.log(html)
if (!html.includes('Smoke 1') || !html.includes('first')) process.exit(1)
`,
  // Production SSR: the server bundle built by \`vite build --ssr\`, run by Node.
  'ssr-prod.mjs': `const { render } = await import('./dist-server/entry-server.js')
const html = await render()
console.log(html)
if (!html.includes('Smoke 1') || !html.includes('first')) process.exit(1)
`,
}
for (const [name, content] of Object.entries(files)) writeFileSync(path.join(app, name), content)

step('npm install')
await $`npm install --no-audit --no-fund --loglevel=error`.cwd(app)

step('vite build (node)')
await $`node node_modules/vite/bin/vite.js build`.cwd(app)
const assets = path.join(app, 'dist', 'assets')
const js = readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(path.join(assets, f), 'utf8')).join('')
const css = readdirSync(assets).filter((f) => f.endsWith('.css')).map((f) => readFileSync(path.join(assets, f), 'utf8')).join('')
if (!/\.keeno-[0-9a-f]{8}/.test(css)) fail('built CSS has no scoped selectors')
if (!js.includes('Smoke ')) fail('built JS is missing the App template')
if (js.includes('__KEENO_DEV__ = true') || js.includes('__KEENO_DEV__=!0')) fail('production build turns on development mode')

step('keeno-check (node)')
await $`node node_modules/@inflector/keeno-check/dist/cli.js`.cwd(app)

step('server render through the Vite dev server (node)')
const devSsr = await $`node ssr.mjs`.cwd(app).quiet()
if (devSsr.stderr.toString().includes('two copies')) fail('dev SSR loaded two copies of the runtime')
console.log(devSsr.stdout.toString().trim())

step('server render from a production SSR build (node)')
await $`node node_modules/vite/bin/vite.js build --ssr src/entry-server.ts --outDir dist-server`.cwd(app)
const prodSsr = await $`node ssr-prod.mjs`.cwd(app).quiet()
if (prodSsr.stderr.toString().includes('two copies')) fail('the SSR build loaded two copies of the runtime')
console.log(prodSsr.stdout.toString().trim())

if (!keep) rmSync(work, { recursive: true, force: true })
console.log(`\n[smoke] OK (vite@${viteMajor})`)

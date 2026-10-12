// The files of a new Keeno project. `projectFiles` is pure (path -> contents); `scaffold` writes them.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEMPLATES = {
  router: 'Pages in src/pages with file-based routing, a layout and a 404 page',
  minimal: 'A single App.kn component',
} as const
export type Template = keyof typeof TEMPLATES

export interface Options {
  /** package.json `name`. */
  name: string
  template: Template
  tailwind: boolean
  /** Version ranges of the Keeno packages, by package name (default: `keenoVersions()`). */
  versions?: Record<string, string>
}

const KEENO_PACKAGES = ['@inflector/keeno', '@inflector/keeno-router', '@inflector/vite-plugin-keeno', '@inflector/keeno-check']

/** Third-party versions the templates are written against. */
const VERSIONS = {
  vite: '^7.0.0',
  typescript: '^5.6.3',
  tailwindcss: '^4.1.0',
  '@tailwindcss/vite': '^4.1.0',
}

/**
 * Ranges for the Keeno packages, from this package's devDependencies: a published create-keeno has the
 * released versions there (`bun pm pack` rewrites `workspace:` ranges); in the monorepo they are read
 * from the sibling packages.
 */
export function keenoVersions(): Record<string, string> {
  let dir = path.dirname(fileURLToPath(import.meta.url))
  let pkg: any
  // Walk up: the code may sit in dist/ or in a dist/chunks/ chunk.
  for (;;) {
    const file = path.join(dir, 'package.json')
    if (existsSync(file)) {
      pkg = JSON.parse(readFileSync(file, 'utf8'))
      if (pkg.name === 'create-keeno') break
    }
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('create-keeno: cannot find its own package.json')
    dir = parent
  }
  const out: Record<string, string> = {}
  for (const name of KEENO_PACKAGES) {
    const range: string | undefined = pkg.devDependencies?.[name]
    if (!range) throw new Error(`create-keeno: no version for ${name}`)
    out[name] = range.startsWith('workspace:') ? `^${workspaceVersion(path.dirname(dir), name)}` : range
  }
  return out
}

function workspaceVersion(packagesDir: string, name: string): string {
  for (const entry of readdirSync(packagesDir)) {
    const file = path.join(packagesDir, entry, 'package.json')
    if (!existsSync(file)) continue
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    if (pkg.name === name) return pkg.version
  }
  throw new Error(`create-keeno: workspace package ${name} not found in ${packagesDir}`)
}

/** A valid npm package name from a directory name. */
export function toPackageName(dir: string): string {
  const name = path
    .basename(path.resolve(dir))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._-]+|-+$/g, '')
  return name || 'keeno-app'
}

const sortKeys = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))

/** Every file of the new project, by path relative to its root. */
export function projectFiles(options: Options): Record<string, string> {
  const { name, template, tailwind } = options
  const v = options.versions ?? keenoVersions()
  const router = template === 'router'

  const dependencies: Record<string, string> = { '@inflector/keeno': v['@inflector/keeno'] }
  if (router) dependencies['@inflector/keeno-router'] = v['@inflector/keeno-router']
  const devDependencies: Record<string, string> = {
    '@inflector/keeno-check': v['@inflector/keeno-check'],
    '@inflector/vite-plugin-keeno': v['@inflector/vite-plugin-keeno'],
    typescript: VERSIONS.typescript,
    vite: VERSIONS.vite,
  }
  if (tailwind) {
    devDependencies.tailwindcss = VERSIONS.tailwindcss
    devDependencies['@tailwindcss/vite'] = VERSIONS['@tailwindcss/vite']
  }

  const pkg = {
    name,
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview', check: 'keeno-check' },
    dependencies: sortKeys(dependencies),
    devDependencies: sortKeys(devDependencies),
  }

  const files: Record<string, string> = {
    'package.json': JSON.stringify(pkg, null, 2) + '\n',
    '.gitignore': 'node_modules\ndist\n*.local\n.DS_Store\n',
    'README.md': readme(name, router),
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(name)}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
    'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
`,
    'vite.config.ts': viteConfig(router, tailwind),
    'src/env.d.ts': `/// <reference types="vite/client" />
${router ? '/// <reference types="@inflector/vite-plugin-keeno/client" />\n' : ''}
declare module '*.kn' {
  const Component: import('@inflector/keeno').Component
  export default Component
}
`,
    'src/main.ts': router
      ? `import { mount } from '@inflector/keeno'
import Pages from 'virtual:keeno-pages'
import './app.css'

// Routes come from the files in src/pages.
mount(Pages, document.getElementById('app')!)
`
      : `import { mount } from '@inflector/keeno'
import App from './App.kn'
import './app.css'

mount(App, document.getElementById('app')!)
`,
    'src/app.css': (tailwind ? `@import 'tailwindcss';\n\n` : '') + GLOBAL_CSS,
  }

  if (router) {
    files['src/pages/_layout.kn'] = LAYOUT
    files['src/pages/index.kn'] = counterPage('Home')
    files['src/pages/about.kn'] = ABOUT
    files['src/pages/_404.kn'] = NOT_FOUND
  } else {
    files['src/App.kn'] = counterPage(name)
  }
  return files
}

export interface ScaffoldResult {
  dir: string
  files: string[]
}

/** Write the project into `dir` (created when missing). */
export function scaffold(dir: string, options: Options): ScaffoldResult {
  const root = path.resolve(dir)
  const files = projectFiles(options)
  for (const [file, contents] of Object.entries(files)) {
    const dest = path.join(root, file)
    mkdirSync(path.dirname(dest), { recursive: true })
    writeFileSync(dest, contents)
  }
  return { dir: root, files: Object.keys(files) }
}

/** True when `dir` is missing or has nothing but a .git directory. */
export function isEmptyDir(dir: string): boolean {
  if (!existsSync(dir)) return true
  return readdirSync(dir).every((f) => f === '.git')
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function viteConfig(router: boolean, tailwind: boolean): string {
  const imports = [`import { defineConfig } from 'vite'`, `import keeno from '@inflector/vite-plugin-keeno'`]
  if (tailwind) imports.push(`import tailwindcss from '@tailwindcss/vite'`)
  const plugins = [router ? `keeno({ useFileRouter: true, pages: './src/pages' })` : 'keeno()']
  if (tailwind) plugins.push('tailwindcss()')
  return `${imports.join('\n')}

export default defineConfig({
${router ? '  // File-based routing: each .kn file in src/pages is a route.\n' : ''}  plugins: [${plugins.join(', ')}],
})
`
}

function readme(name: string, router: boolean): string {
  return `# ${name}

A [Keeno](https://github.com/iliesw/Keeno) app.

| Command | |
|---|---|
| \`dev\` | Start the dev server |
| \`build\` | Build for production into \`dist/\` |
| \`preview\` | Serve the production build |
| \`check\` | Type-check every \`.kn\` and \`.ts\` file |

${
  router
    ? 'Pages live in `src/pages`: `index.kn` is `/`, `about.kn` is `/about`, `_layout.kn` wraps every page and `_404.kn` renders unknown URLs.'
    : 'Start editing `src/App.kn`.'
}
`
}

const GLOBAL_CSS = `:root {
  font-family: system-ui, sans-serif;
  color: #1f2937;
  background: #f5f5f4;
}

body {
  margin: 0;
}
`

const counterPage = (title: string) => `<script lang="ts">
  const count = state(0)
  const doubled = derived(() => count * 2)
</script>

<main>
  <h1>${escapeHtml(title)}</h1>
  <p>Clicked {count} times ({doubled} doubled)</p>
  <button type="button" onClick={() => count.set(count + 1)}>+1</button>
</main>

<style>
  main {
    max-width: 32rem;
    margin: 2rem auto;
    padding: 1.5rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.1);
  }
  h1 {
    margin-top: 0;
    color: teal;
  }
  button {
    background: teal;
    color: white;
    border: 0;
    border-radius: 6px;
    padding: 0.4rem 0.8rem;
    cursor: pointer;
  }
</style>
`

const LAYOUT = `<script lang="ts">
  import type { Children } from '@inflector/keeno'
  import { Link } from '@inflector/keeno-router'
  // Wraps every page and stays mounted while you navigate between them.
  const { children } = props<{ children: Children }>()
</script>

<nav>
  <Link href="/" exact>Home</Link>
  <Link href="/about">About</Link>
</nav>
{children}

<style>
  nav {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
  }
  a {
    color: teal;
    text-decoration: none;
    padding: 0.3rem 0.8rem;
    border-radius: 6px;
  }
  .active {
    background: rgb(0 128 128 / 0.12);
  }
</style>
`

const ABOUT = `<script lang="ts">
  import { Link } from '@inflector/keeno-router'
</script>

<main>
  <h1>About</h1>
  <p>
    This page is <code>src/pages/about.kn</code>. Add a file to <code>src/pages</code> to add a route.
  </p>
  <p><Link href="/">Back home</Link></p>
</main>

<style>
  main {
    max-width: 32rem;
    margin: 2rem auto;
    padding: 1.5rem;
    background: white;
    border-radius: 12px;
  }
  h1 {
    margin-top: 0;
  }
  a {
    color: teal;
  }
</style>
`

const NOT_FOUND = `<script lang="ts">
  import { Link, useRoute } from '@inflector/keeno-router'
  const route = useRoute()
</script>

<main>
  <h1>Not found</h1>
  <p>There is no page at <code>{route.path}</code>. <Link href="/">Go home</Link></p>
</main>

<style>
  main {
    max-width: 32rem;
    margin: 2rem auto;
    padding: 1.5rem;
    background: white;
    border-radius: 12px;
  }
  a {
    color: teal;
  }
</style>
`

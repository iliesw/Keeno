// Vite plugin: compiles .kn files, serves their scoped CSS as a virtual module, wires HMR.
import { compile } from '@inflector/keeno-compiler'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as vite from 'vite'
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite'
import { createHandler, page, splitTemplate, stylesheetLinks, withHead, type ServerEntry } from './server'

/**
 * Strip TypeScript from the compiled module. Vite 8 bundles Oxc and only finds esbuild when it is
 * installed separately, so prefer `transformWithOxc` when this Vite version has it.
 */
async function stripTypes(code: string, file: string, map: any): Promise<{ code: string; map: any }> {
  const oxc = (vite as any).transformWithOxc as undefined | ((...args: any[]) => Promise<{ code: string; map: any; errors?: any[] }>)
  if (oxc) {
    const out = await oxc(code, file, { lang: 'ts', sourcemap: true }, map)
    if (out.errors?.length) throw new Error(out.errors.map((e: any) => e.message ?? String(e)).join('\n'))
    return { code: out.code, map: out.map }
  }
  const out = await vite.transformWithEsbuild(code, file, { loader: 'ts', sourcemap: true, sourcefile: file }, map)
  return { code: out.code, map: out.map }
}

export interface TailwindOptions {
  /**
   * The stylesheet `@reference`d by component styles that use Tailwind (`@apply`, `@variant`,
   * `--spacing()`, ...), relative to the Vite root. Default: the first `.css` file in the project
   * that imports `tailwindcss`, or `tailwindcss` itself (default theme) when there is none.
   */
  reference?: string
}

export interface KeenoPluginOptions {
  /** Enable hot module replacement in dev (default true). */
  hmr?: boolean
  /**
   * Tailwind CSS v4 in component `<style>` blocks. Default: on when `@tailwindcss/vite` is in the
   * plugins. `false` turns it off.
   */
  tailwind?: boolean | TailwindOptions
  /**
   * The in-page dev tools panel during `vite dev` (default true): component tree, live state
   * editing, element picker, state timeline and render stats. Toggle it with Alt+Shift+D.
   */
  devtools?: boolean
  /**
   * File-based routing (default true): `virtual:keeno-pages` exports the routes of the `pages`
   * directory and a `<Pages>` component rendering them with `@inflector/keeno-router`.
   */
  useFileRouter?: boolean
  /** The directory of page files, relative to the Vite root (default `./src/pages`). */
  pages?: string
  /**
   * How pages render (default `'spa'`). Every strategy other than `'spa'` uses the file router,
   * with `start()` from `virtual:keeno-pages` in `src/main.ts`.
   * - `'spa'`: in the browser only.
   * - `'ssr'`: on the server for each request (streamed), then hydrated. `vite build` writes
   *   `dist/client` and `dist/server`; serve them with `createHandler()` from
   *   `@inflector/vite-plugin-keeno/server`.
   * - `'ssg'`: rendered to static HTML at build time (`dist/<path>/index.html`), then hydrated.
   * - `'islands'`: static HTML like `'ssg'`, and only components written with
   *   `client="load" | "idle" | "visible"` load JavaScript, each on its own.
   */
  renderStrategy?: RenderStrategy
  /**
   * `'ssg'` and `'islands'`: more paths to render at build time, for routes with parameters
   * (`/blog/:slug`). Pages without parameters are always rendered.
   */
  prerender?: string[] | (() => string[] | Promise<string[]>)
}

export type RenderStrategy = 'spa' | 'ssr' | 'ssg' | 'islands'

/** Comes with the plugin, so apps can import it without installing it. */
const ROUTER = '@inflector/keeno-router'
/** This file: the router is resolved from here when the app has no copy of its own. */
const SELF = fileURLToPath(import.meta.url)

/** The module that holds the file routes: `import Pages from 'virtual:keeno-pages'`. */
export const PAGES_ID = 'virtual:keeno-pages'
const RESOLVED_PAGES_ID = '\0' + PAGES_ID
/** Renders a page on the server (`render(url)`), for the dev server, `ssr` builds and prerendering. */
export const SERVER_ID = 'virtual:keeno-server'
const RESOLVED_SERVER_ID = '\0' + SERVER_ID

/**
 * The file routes module. Layouts and error pages are bundled with it, so they show without a
 * loading step; pages load on demand, each in its own chunk.
 */
export function pagesModule(dir: string, strategy: RenderStrategy = 'spa', ssr = false): string {
  const glob = (patterns: string[], eager = false) =>
    `import.meta.glob(${JSON.stringify(patterns)}${eager ? ', { eager: true }' : ''})`
  const shared = [`${dir}/**/_layout.kn`, `${dir}/**/_[1-5][0-9][0-9].kn`]
  const pages = [
    `export const routes = pageRoutes({`,
    `  ...${glob([`${dir}/**/*.kn`, ...shared.map((p) => '!' + p)])},`,
    `  ...${glob(shared, true)},`,
    `}, ${JSON.stringify(dir)})`,
    `/** Renders the page for the current URL. Takes the other props of <Router> (base, url, fallback). */`,
    `export default function Pages(props) {`,
    `  return createComponent(Router, mergeProps(props ?? {}, { routes }))`,
    `}`,
  ]
  const imports = [
    `import { createComponent, mergeProps } from '@inflector/keeno/internal'`,
    `import { Router, pageRoutes, preloadRoute } from '@inflector/keeno-router'`,
  ]
  if (strategy === 'islands' && !ssr) {
    // The browser never renders pages: it only hydrates their islands, loading each one's code
    // when it starts. Pages are only in the server build.
    return [
      `import { bootIslands } from '@inflector/keeno/internal'`,
      `export const routes = []`,
      `export default function Pages() { return null }`,
      `/** Hydrate the islands of this page. */`,
      `export function start() {`,
      `  return bootIslands(${glob(['/**/*.kn', '!**/node_modules/**'])})`,
      `}`,
      ``,
    ].join('\n')
  }
  if (ssr) return [...imports, ...pages, ``].join('\n')
  const start =
    strategy === 'spa'
      ? [`  return mount(Pages, el)`]
      : [`  await preloadRoute(routes, location.pathname + location.search)`, `  return hydrate(Pages, el)`]
  return [
    ...imports,
    `import { hydrate, mount } from '@inflector/keeno'`,
    ...pages,
    `/** Render the pages into \`target\` (an element or a selector, default \`#app\`). */`,
    `export async function start(target = '#app') {`,
    `  const el = typeof target === 'string' ? document.querySelector(target) : target`,
    ...start,
    `}`,
    ``,
  ].join('\n')
}

/** `virtual:keeno-server`: `render(url, { stream })` for the dev server, `ssr` builds and prerendering. */
export function serverModule(): string {
  return [
    `import { renderToStream, renderToString } from '@inflector/keeno/server'`,
    `import { preloadRoute } from '@inflector/keeno-router'`,
    `import Pages, { routes } from '${PAGES_ID}'`,
    `export { routes }`,
    `export async function render(url, options = {}) {`,
    `  await preloadRoute(routes, url)`,
    `  const context = {}`,
    `  if (!options.stream) {`,
    `    const html = await renderToString(Pages, { url }, { context })`,
    `    return { html, head: context.head ?? '', status: context.status ?? 200 }`,
    `  }`,
    // The head and status are known once the first chunk is out.
    `  const source = renderToStream(Pages, { url }, { context }).getReader()`,
    `  const first = await source.read()`,
    `  const stream = new ReadableStream({`,
    `    start(c) { if (first.done) c.close(); else c.enqueue(first.value) },`,
    `    async pull(c) { const { value, done } = await source.read(); if (done) c.close(); else c.enqueue(value) },`,
    `    cancel() { return source.cancel() },`,
    `  })`,
    `  return { stream, head: context.head ?? '', status: context.status ?? 200 }`,
    `}`,
    ``,
  ].join('\n')
}

// `&lang.css` (as Vue and Svelte do) is what makes `@tailwindcss/vite` and other CSS tools process it.
const STYLE_QUERY = 'keeno&type=style&lang.css'

/** CSS that needs Tailwind's theme and utilities, so it must `@reference` the main stylesheet. */
const USES_TAILWIND = /@apply\b|@variant\b|@screen\b|(?<![\w-])theme\(|--(?:theme|spacing|alpha)\(/
/** A stylesheet that already brings Tailwind in itself. */
const HAS_REFERENCE = /@reference\b|@import\s+(?:url\()?["']tailwindcss/
const IMPORTS_TAILWIND = /@import\s+(?:url\()?["']tailwindcss["']/

/** The project's main Tailwind stylesheet: the shallowest `.css` file that imports `tailwindcss`. */
function findTailwindEntry(root: string): string | undefined {
  let level = [root]
  for (let depth = 0; depth < 4 && level.length; depth++) {
    const next: string[] = []
    for (const dir of level) {
      let entries
      try {
        entries = readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) next.push(full)
        else if (e.name.endsWith('.css') && IMPORTS_TAILWIND.test(readFileSync(full, 'utf8'))) return full
      }
    }
    level = next
  }
}

function parseId(id: string) {
  const [file, query = ''] = id.split('?', 2)
  return { file, query }
}

export default function keeno(options: KeenoPluginOptions = {}): Plugin {
  let config: ResolvedConfig
  let tailwind = false
  let reference: string | undefined
  const strategy: RenderStrategy = options.renderStrategy ?? 'spa'
  const rendersOnServer = strategy !== 'spa'
  if (rendersOnServer && options.useFileRouter === false) {
    throw new Error(`[keeno] renderStrategy: '${strategy}' renders the file routes: it needs useFileRouter`)
  }

  /** File path relative to the project root, used for the scope hash (stable across machines). */
  const relative = (file: string) => path.relative(config.root, file).replace(/\\/g, '/')

  return {
    name: 'vite-plugin-keeno',
    enforce: 'pre',

    configResolved(c) {
      config = c
      const tw = options.tailwind
      tailwind = tw === undefined ? (c.plugins ?? []).some((p) => p.name.startsWith('@tailwindcss/vite')) : tw !== false
      reference = typeof tw === 'object' && tw.reference ? path.resolve(c.root, tw.reference) : undefined
    },

    load(id, opts) {
      if (id === RESOLVED_PAGES_ID) {
        const dir = relative(path.resolve(config.root, options.pages ?? './src/pages')).replace(/\/+$/, '')
        if (dir.startsWith('..') || path.isAbsolute(dir)) {
          throw new Error(`[keeno] The pages directory must be inside the Vite root: ${options.pages}`)
        }
        return pagesModule(dir ? '/' + dir : '', strategy, !!opts?.ssr)
      }
      if (id === RESOLVED_SERVER_ID) return serverModule()
      const { file, query } = parseId(id)
      if (!file.endsWith('.kn') || !isStyleQuery(query)) return
      // Compile from disk so the CSS is never stale relative to the component during HMR.
      const css = compile(readFileSync(file, 'utf8'), { filename: relative(file) }).css
      const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
      if (!tailwind || !USES_TAILWIND.test(code) || HAS_REFERENCE.test(code)) return css
      // Found lazily (only once a style needs it), so projects without such styles never scan.
      reference ??= findTailwindEntry(config.root) ?? 'tailwindcss'
      const ref = path.isAbsolute(reference) ? reference.replace(/\\/g, '/') : reference
      return `@reference ${JSON.stringify(ref)};\n${css}`
    },

    config(user, env) {
      // One runtime, even when the router comes from the plugin's own dependencies.
      const out: vite.UserConfig = { resolve: { dedupe: ['@inflector/keeno'] } }
      // `ssr` builds put the browser files in dist/client (dist/server is the server's).
      const buildOrPreview = env.command === 'build' || (env as { isPreview?: boolean }).isPreview
      if (strategy === 'ssr' && buildOrPreview && !user.build?.ssr && !user.build?.outDir) {
        out.build = { outDir: 'dist/client' }
      }
      // Keep the runtime in the server bundle: it must be the same copy as the components'.
      if (rendersOnServer) out.ssr = { noExternal: ['@inflector/keeno', '@inflector/keeno-router'] }
      return out
    },

    async resolveId(id, importer, opts) {
      if (id === PAGES_ID && options.useFileRouter !== false) return RESOLVED_PAGES_ID
      // As a build entry, Vite passes it resolved against the root, like a file.
      const server = id === SERVER_ID || id.replace(/\\/g, '/').endsWith('/' + SERVER_ID)
      if (server && options.useFileRouter !== false) return RESOLVED_SERVER_ID
      if (id !== ROUTER) return
      // The app's own copy if it installed one, else the plugin's.
      const resolveOpts = { ...opts, skipSelf: true }
      return (await this.resolve(id, importer, resolveOpts)) ?? this.resolve(id, SELF, resolveOpts)
    },

    async transform(code, id, opts) {
      const { file, query } = parseId(id)
      if (!file.endsWith('.kn') || query) return

      const dev = config.command === 'serve' && !config.isProduction
      // Server modules are loaded again for each change, so they don't need the hot wrapper.
      const hmr = options.hmr !== false && dev && !opts?.ssr
      let result
      try {
        result = compile(code, { filename: relative(file), hmrId: hmr ? relative(file) : undefined, dev, islands: strategy === 'islands' })
      } catch (err: any) {
        if (err.loc) err.loc = { file, ...err.loc }
        err.id = file
        throw err
      }

      let js = result.js
      if (result.css) js = `import ${JSON.stringify(`${file}?${STYLE_QUERY}`)};\n${js}`
      // Self-accept: re-executing the module swaps the implementation behind the stable wrapper.
      if (hmr) js += '\nif (import.meta.hot) import.meta.hot.accept()\n'
      // `vite dev` turns on the runtime's development warnings and dev tools hook.
      if (config.command === 'serve') js += '\nglobalThis.__KEENO_DEV__ = true\n'
      // The panel only talks to the runtime through `__KEENO_DEVTOOLS__`, so it can load from anywhere.
      if (dev && !opts?.ssr && options.devtools !== false) js += 'import "@inflector/keeno/devtools"\n'

      return stripTypes(js, file, result.map)
    },

    configureServer(server) {
      if (!rendersOnServer) return
      // Before Vite's own HTML handling: page requests are rendered, everything else passes through.
      server.middlewares.use(async (req, res, next) => {
        if (!isPageRequest(req.method, req.url, req.headers.accept)) return next()
        try {
          const url = req.url!
          const html = readFileSync(path.join(config.root, 'index.html'), 'utf8')
          const template = await server.transformIndexHtml(url, html, req.originalUrl)
          const entry = (await server.ssrLoadModule(SERVER_ID)) as ServerEntry
          const stream = strategy === 'ssr'
          const result = await entry.render(url, { stream })
          const head = result.head + devStylesheets(server)
          res.statusCode = result.status
          res.setHeader('content-type', 'text/html; charset=utf-8')
          if (!stream) return void res.end(page(template, result.html!, head, false))
          const [before, after] = splitTemplate(template)
          res.write(withHead(before, head))
          const reader = result.stream!.getReader()
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            res.write(value)
          }
          res.end(after)
        } catch (err: any) {
          server.ssrFixStacktrace(err)
          next(err)
        }
      })
    },

    configurePreviewServer(server) {
      if (strategy !== 'ssr') return
      const dist = path.resolve(config.root, config.build.outDir, '..')
      const handler = createHandler({ dist, base: config.base })
      server.middlewares.use((req, res, next) => {
        if (!isPageRequest(req.method, req.url, req.headers.accept)) return next()
        void handler(req, res, next)
      })
    },

    async closeBundle() {
      // After the browser build: build the server bundle, then (ssg, islands) render the pages.
      if (!rendersOnServer || config.command !== 'build' || config.build.ssr) return
      const clientDir = path.resolve(config.root, config.build.outDir)
      const serverDir =
        strategy === 'ssr' ? path.join(clientDir, '..', 'server') : path.join(config.root, 'node_modules', '.keeno', 'prerender')
      await vite.build({
        configFile: config.configFile,
        root: config.root,
        mode: config.mode,
        logLevel: 'warn',
        build: {
          ssr: SERVER_ID,
          outDir: serverDir,
          emptyOutDir: true,
          rollupOptions: { output: { entryFileNames: 'entry-server.js' } },
        },
      })
      if (strategy === 'ssr') return
      const entry = (await import(pathToFileURL(path.join(serverDir, 'entry-server.js')).href)) as ServerEntry
      const paths = new Set(staticPaths(entry.routes))
      const extra = typeof options.prerender === 'function' ? await options.prerender() : options.prerender ?? []
      for (const p of extra) paths.add(p)
      const count = await prerender(entry, clientDir, [...paths], strategy === 'islands', config.base)
      rmSync(serverDir, { recursive: true, force: true })
      config.logger.info(`[keeno] rendered ${count} page${count === 1 ? '' : 's'} to ${path.relative(config.root, clientDir)}`)
    },
  }
}

/** A GET for a page (not a file or a Vite request) that accepts HTML. */
function isPageRequest(method: string | undefined, url: string | undefined, accept: string | undefined): boolean {
  if ((method !== 'GET' && method !== 'HEAD') || !url) return false
  const pathname = url.split('?')[0]
  if (pathname.startsWith('/@') || pathname.startsWith('/__') || pathname.startsWith('/node_modules/')) return false
  if (/\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith('.html')) return false
  return !accept || accept.includes('text/html') || accept.includes('*/*')
}

/**
 * In dev, component styles are injected by their modules in the browser, which never loads
 * server-only components (pages, with islands): link every component stylesheet the server loaded.
 */
function devStylesheets(server: ViteDevServer): string {
  const links: string[] = []
  for (const mod of server.moduleGraph.idToModuleMap.values()) {
    const { file, query } = parseId(mod.url)
    if (file.endsWith('.kn') && isStyleQuery(query)) links.push(`<link rel="stylesheet" href="${file}?direct&${STYLE_QUERY}">`)
  }
  return links.join('')
}

/** The query of a component's stylesheet, maybe with Vite's `direct` and timestamp parameters. */
function isStyleQuery(query: string): boolean {
  return query.split('&').filter((p) => p !== 'direct' && !p.startsWith('t=')).join('&') === STYLE_QUERY
}

/** The paths of the routes without parameters (`/blog/:slug` and catch-alls need `prerender`). */
export function staticPaths(routes: { path: string }[]): string[] {
  return [...new Set(routes.map((r) => r.path).filter((p) => !/[:*]/.test(p)))]
}

/** Render each path into `clientDir/<path>/index.html`, and `404.html`. Returns the page count. */
async function prerender(entry: ServerEntry, clientDir: string, paths: string[], islands: boolean, base: string): Promise<number> {
  const template = readFileSync(path.join(clientDir, 'index.html'), 'utf8')
  const links = stylesheetLinks(clientDir, template, base)
  const prepared = links ? template.replace(/<\/head>/i, `${links}\n</head>`) : template
  let count = 0
  const write = (rel: string, html: string) => {
    const out = path.join(clientDir, rel)
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, html)
    count++
  }
  for (const p of paths) {
    const { html, head, status } = await entry.render(p)
    if (status === 404) continue
    write(p === '/' ? 'index.html' : path.join(p.replace(/^\/+|\/+$/g, ''), 'index.html'), page(prepared, html!, head, islands))
  }
  // The not-found page, when the app has one.
  const missing = await entry.render('/__keeno_not_found__')
  if (missing.status === 404 && missing.html) write('404.html', page(prepared, missing.html, missing.head, islands))
  return count
}

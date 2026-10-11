// Vite plugin: compiles .kn files, serves their scoped CSS as a virtual module, wires HMR.
import { compile } from '@inflector/keeno-compiler'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as vite from 'vite'
import type { Plugin, ResolvedConfig } from 'vite'

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

    load(id) {
      const { file, query } = parseId(id)
      if (!file.endsWith('.kn') || query !== STYLE_QUERY) return
      // Compile from disk so the CSS is never stale relative to the component during HMR.
      const css = compile(readFileSync(file, 'utf8'), { filename: relative(file) }).css
      const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
      if (!tailwind || !USES_TAILWIND.test(code) || HAS_REFERENCE.test(code)) return css
      // Found lazily (only once a style needs it), so projects without such styles never scan.
      reference ??= findTailwindEntry(config.root) ?? 'tailwindcss'
      const ref = path.isAbsolute(reference) ? reference.replace(/\\/g, '/') : reference
      return `@reference ${JSON.stringify(ref)};\n${css}`
    },

    async transform(code, id, opts) {
      const { file, query } = parseId(id)
      if (!file.endsWith('.kn') || query) return

      const dev = config.command === 'serve' && !config.isProduction
      const hmr = options.hmr !== false && dev
      let result
      try {
        result = compile(code, { filename: relative(file), hmrId: hmr ? relative(file) : undefined, dev })
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
  }
}

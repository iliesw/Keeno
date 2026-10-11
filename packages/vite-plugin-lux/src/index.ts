// Vite plugin: compiles .lx files, serves their scoped CSS as a virtual module, wires HMR.
import { compile } from '@inflector/lux-compiler'
import { readFileSync } from 'node:fs'
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

export interface LuxPluginOptions {
  /** Enable hot module replacement in dev (default true). */
  hmr?: boolean
}

const STYLE_QUERY = 'lux&type=style.css'

function parseId(id: string) {
  const [file, query = ''] = id.split('?', 2)
  return { file, query }
}

export default function lux(options: LuxPluginOptions = {}): Plugin {
  let config: ResolvedConfig

  /** File path relative to the project root, used for the scope hash (stable across machines). */
  const relative = (file: string) => path.relative(config.root, file).replace(/\\/g, '/')

  return {
    name: 'vite-plugin-lux',
    enforce: 'pre',

    configResolved(c) {
      config = c
    },

    load(id) {
      const { file, query } = parseId(id)
      if (!file.endsWith('.lx') || query !== STYLE_QUERY) return
      // Compile from disk so the CSS is never stale relative to the component during HMR.
      return compile(readFileSync(file, 'utf8'), { filename: relative(file) }).css
    },

    async transform(code, id) {
      const { file, query } = parseId(id)
      if (!file.endsWith('.lx') || query) return

      const hmr = options.hmr !== false && config.command === 'serve' && !config.isProduction
      let result
      try {
        result = compile(code, { filename: relative(file), hmrId: hmr ? relative(file) : undefined })
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
      if (config.command === 'serve') js += '\nglobalThis.__LUX_DEV__ = true\n'

      return stripTypes(js, file, result.map)
    },
  }
}

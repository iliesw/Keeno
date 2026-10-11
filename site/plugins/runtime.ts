// Vite plugin: `virtual:lux-runtime` exports the Lux runtime (and the router) as self-contained
// ES module source strings. The playground runs compiled components in an iframe, where an
// import map points `@inflector/lux` and `@inflector/lux/internal` at a blob of this code.
// `virtual:lux-stats` exports their gzipped sizes, for the home page.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import type { Plugin } from 'vite'

const RUNTIME = 'virtual:lux-runtime'
const STATS = 'virtual:lux-stats'
const packages = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages')

async function bundle(entry: string, external: string[] = []): Promise<string> {
  const Bun = (globalThis as any).Bun
  if (!Bun) throw new Error('[lux-docs] virtual:lux-runtime is bundled with Bun: run the site with `bun`.')
  const out = await Bun.build({
    entrypoints: [entry],
    target: 'browser',
    format: 'esm',
    minify: true,
    external,
    conditions: ['lux-source'],
  })
  if (!out.success) throw new AggregateError(out.logs, '[lux-docs] bundling the playground runtime failed')
  return await out.outputs[0].text()
}

async function bundleAll(): Promise<{ lux: string; router: string }> {
  // One module with the public API and the helpers compiled components import.
  const dir = mkdtempSync(path.join(tmpdir(), 'lux-runtime-'))
  const entry = path.join(dir, 'runtime.ts')
  const src = (f: string) => JSON.stringify(path.join(packages, 'lux/src', f).replace(/\\/g, '/'))
  writeFileSync(entry, `export * from ${src('index.ts')}\nexport * from ${src('internal.ts')}\n`)
  try {
    const lux = await bundle(entry)
    const router = await bundle(path.join(packages, 'router/src/index.ts'), ['@inflector/lux', '@inflector/lux/internal'])
    return { lux, router }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const kb = (code: string) => Math.round((gzipSync(code).length / 1024) * 10) / 10

export default function runtime(): Plugin {
  let cache: Promise<{ lux: string; router: string }> | undefined
  return {
    name: 'lux-docs-runtime',
    resolveId(id) {
      if (id === RUNTIME || id === STATS) return '\0' + id
    },
    async load(id) {
      if (id !== '\0' + RUNTIME && id !== '\0' + STATS) return
      const { lux, router } = await (cache ??= bundleAll())
      if (id === '\0' + STATS) return `export const runtimeKb = ${kb(lux)}\nexport const routerKb = ${kb(router)}\n`
      return `export const lux = ${JSON.stringify(lux)}\nexport const router = ${JSON.stringify(router)}\n`
    },
  }
}

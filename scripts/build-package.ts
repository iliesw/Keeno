// Build one workspace package for publishing: ESM JS (Bun.build) and .d.ts files (tsc) into dist/.
// Run from the package directory: `bun ../../scripts/build-package.ts --target=browser|node`.
//
// Entry points come from the package's `exports` map: each entry's `keeno-source` condition names
// the source file and its `import` condition the output. Hand-written `.d.ts` entries (types-only
// exports such as `@inflector/keeno/kn`) are copied as-is.
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const cwd = process.cwd()
const pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'))

const targetArg = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length)
if (targetArg !== 'browser' && targetArg !== 'node') {
  console.error(`[${pkg.name}] expected --target=browser or --target=node`)
  process.exit(1)
}
const target: 'browser' | 'node' = targetArg

const entrypoints: string[] = []
const copies: [string, string][] = []
for (const [subpath, value] of Object.entries<any>(pkg.exports ?? {})) {
  const source: string | undefined = value?.['keeno-source']
  if (!source) continue
  if (source.endsWith('.d.ts')) {
    if (!value.types) throw new Error(`[${pkg.name}] export ${subpath}: .d.ts source needs a "types" target`)
    copies.push([source, value.types])
  } else {
    entrypoints.push(path.join(cwd, source))
  }
}

rmSync(path.join(cwd, 'dist'), { recursive: true, force: true })

// Bundle a copy of src/ staged outside the repo, for two Bun.build quirks (Bun 1.4):
// - the root tsconfig `paths` (workspace packages -> sources) win over `external`, which would
//   inline sibling packages such as @inflector/keeno-compiler into vite-plugin-keeno;
// - `"sideEffects": false` in the package's own package.json turns on barrel optimisation, which
//   drops everything re-exported by entry points like src/index.ts.
// A fixed path (not mkdtemp) keeps chunk hashes stable between builds.
const stage = path.join(tmpdir(), 'keeno-build', pkg.name.replace(/[@/]/g, '_'))
rmSync(stage, { recursive: true, force: true })
let result: Awaited<ReturnType<typeof Bun.build>>
try {
  cpSync(path.join(cwd, 'src'), path.join(stage, 'src'), { recursive: true })
  writeFileSync(path.join(stage, 'package.json'), '{ "private": true }\n')
  writeFileSync(path.join(stage, 'tsconfig.json'), '{}\n')
  result = await Bun.build({
    entrypoints: entrypoints.map((e) => path.join(stage, path.relative(cwd, e))),
    root: path.join(stage, 'src'),
    outdir: path.join(cwd, 'dist'),
    target,
    format: 'esm',
    // Entry points share chunks, so e.g. `@inflector/keeno` and `@inflector/keeno/internal` use one copy of the signal graph.
    splitting: true,
    // Dependencies (including sibling workspace packages) are resolved by the consumer.
    packages: 'external',
    naming: { entry: '[dir]/[name].[ext]', chunk: 'chunks/[name]-[hash].[ext]' },
  })
} finally {
  rmSync(stage, { recursive: true, force: true })
}
if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

const tsc = Bun.spawnSync([process.execPath, require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'], {
  cwd,
  stdout: 'inherit',
  stderr: 'inherit',
})
if (tsc.exitCode !== 0) {
  console.error(`[${pkg.name}] tsc failed`)
  process.exit(tsc.exitCode ?? 1)
}

for (const [from, to] of copies) {
  mkdirSync(path.dirname(path.join(cwd, to)), { recursive: true })
  copyFileSync(path.join(cwd, from), path.join(cwd, to))
}

console.log(`[${pkg.name}] built ${result.outputs.length} JS file(s) for ${target} into dist/`)

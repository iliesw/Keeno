// Bundle the extension client and the language server into dist/ (CommonJS, for VS Code's Node).
import type { BunPlugin } from 'bun'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tailwindCssData } from '../../language-server/src/tailwind'

/**
 * Some vscode-* packages ship a UMD `main` whose dynamic requires a bundler cannot follow, plus an
 * ESM `module` entry. Prefer `module` for bare imports of packages without an `exports` map.
 */
const preferModuleField: BunPlugin = {
  name: 'prefer-module-field',
  setup(build) {
    build.onResolve({ filter: /^(@[^/]+\/[^/]+|[^./][^/]*)$/ }, (args) => {
      let pkgPath: string
      try {
        pkgPath = require.resolve(`${args.path}/package.json`, { paths: [path.dirname(args.importer)] })
      } catch {
        return
      }
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg.exports || !pkg.module) return
      return { path: path.join(path.dirname(pkgPath), pkg.module) }
    })
  },
}

const root = path.resolve(import.meta.dir, '..')
/** `--production`: minified, no source maps (used when packaging). */
const production = process.argv.includes('--production')
rmSync(path.join(root, 'dist'), { recursive: true, force: true })

const builds = [
  { entry: path.join(root, 'src/extension.ts'), name: 'client.js' },
  { entry: path.resolve(root, '../language-server/src/server.ts'), name: 'server.js' },
]

for (const { entry, name } of builds) {
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: path.join(root, 'dist'),
    naming: name,
    target: 'node',
    format: 'cjs',
    external: ['vscode'],
    plugins: [preferModuleField],
    sourcemap: production ? 'none' : 'linked',
    minify: production,
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  console.log(`built dist/${name}`)
}

// Tailwind's at-rules for VS Code's own CSS service (`contributes.css.customData`), so plain .css files
// (e.g. the stylesheet with `@import "tailwindcss"`) don't warn "Unknown at rule @apply" either.
writeFileSync(path.join(root, 'dist/tailwind.css-data.json'), JSON.stringify(tailwindCssData, null, 2))
console.log('built dist/tailwind.css-data.json')

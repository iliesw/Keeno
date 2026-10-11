// Compile the dev tools panel, written in Keeno (packages/keeno/src/devtools/ui/*.kn), into TypeScript
// modules (packages/keeno/src/devtools/gen/*.ts) that the runtime package bundles like its other
// sources, so neither the package build nor apps need a .kn loader for it. Their scoped <style>
// blocks are collected into gen/styles.ts.
//
//   bun run devtools          regenerate
//   bun run devtools --check  fail if the generated files are out of date (CI, tests)
import { readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { compile } from '../packages/compiler/src/index'

const dir = path.resolve(import.meta.dir, '../packages/keeno/src/devtools')
const uiDir = path.join(dir, 'ui')
const genDir = path.join(dir, 'gen')

/** The generated files: file name -> contents. */
export function generate(): Map<string, string> {
  const out = new Map<string, string>()
  const css: string[] = []
  for (const file of readdirSync(uiDir).filter((f) => f.endsWith('.kn')).sort()) {
    const name = file.slice(0, -3)
    const result = compile(readFileSync(path.join(uiDir, file), 'utf8'), { filename: `devtools/ui/${file}` })
    // Scoped component styles are collected into gen/styles.ts, which the panel puts in its shadow root.
    if (result.css.trim()) css.push(`/* ${file} */\n${result.css.trim()}\n`)
    const js = result.js
      .replace(/from (["'])@inflector\/keeno\/internal\1/g, 'from "../../internal"')
      .replace(/from (["'])@inflector\/keeno\1/g, 'from "../../index"')
      .replace(/from (["'])\.\/([\w-]+)\.kn\1/g, 'from "./$2"')
    out.set(
      `${name}.ts`,
      `// Generated from ../ui/${file} by scripts/build-devtools.ts. Edit the .kn file, then run \`bun run devtools\`.\n// @ts-nocheck\n${js}\n`,
    )
  }
  out.set(
    'styles.ts',
    `// Generated from the <style> blocks of ../ui/*.kn by scripts/build-devtools.ts.\nexport const COMPONENT_CSS = ${JSON.stringify(css.join('\n'))}\n`,
  )
  return out
}

/** Names of generated files that differ from what is on disk (or are missing or extra). */
export function stale(): string[] {
  const files = generate()
  const onDisk = existsSync(genDir) ? readdirSync(genDir).filter((f) => f.endsWith('.ts')) : []
  const bad = onDisk.filter((f) => !files.has(f))
  for (const [name, code] of files) {
    const p = path.join(genDir, name)
    if (!existsSync(p) || readFileSync(p, 'utf8').replace(/\r\n/g, '\n') !== code) bad.push(name)
  }
  return bad
}

if (import.meta.main) {
  if (process.argv.includes('--check')) {
    const bad = stale()
    if (bad.length) {
      console.error(`dev tools: out of date: ${bad.join(', ')}. Run \`bun run devtools\`.`)
      process.exit(1)
    }
  } else {
    const files = generate()
    rmSync(genDir, { recursive: true, force: true })
    mkdirSync(genDir, { recursive: true })
    for (const [name, code] of files) writeFileSync(path.join(genDir, name), code)
    console.log(`dev tools: compiled ${files.size - 1} component(s) into packages/keeno/src/devtools/gen`)
  }
}

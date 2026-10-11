#!/usr/bin/env node
// lux-check [dir | tsconfig.json] [--lx-only]
// Type-checks a project's .lx and .ts files. Exits with 1 when there are errors.
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { check, format } from './check'

const HELP = `Usage: lux-check [project] [--lx-only]

  project     tsconfig.json, or a directory containing one (default: .)
  --lx-only   check only .lx files (default: every .lx and .ts file in the tsconfig)
`

const args = process.argv.slice(2)
if (args.includes('-h') || args.includes('--help')) {
  process.stdout.write(HELP)
  process.exit(0)
}
const unknown = args.find((a) => a.startsWith('-') && a !== '--lx-only' && a !== '-p' && a !== '--project')
if (unknown) {
  process.stderr.write(`lux-check: unknown option ${unknown}\n\n${HELP}`)
  process.exit(2)
}
const target = args.filter((a) => !a.startsWith('-'))[0] ?? '.'
const tsconfig = existsSync(target) && statSync(target).isDirectory() ? path.join(target, 'tsconfig.json') : target
if (!existsSync(tsconfig)) {
  process.stderr.write(`lux-check: ${tsconfig} not found\n`)
  process.exit(2)
}

const { files, problems } = await check(tsconfig, { all: !args.includes('--lx-only') })
for (const p of problems) process.stdout.write(format(p) + '\n')
const errors = problems.filter((p) => p.severity === 'error').length
const warnings = problems.length - errors
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
process.stdout.write(
  `${problems.length ? '\n' : ''}${plural(errors, 'error')}${warnings ? `, ${plural(warnings, 'warning')}` : ''} in ${plural(files.length, 'file')}\n`,
)
process.exit(errors ? 1 : 0)

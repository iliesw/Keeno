#!/usr/bin/env node
// create-keeno [dir] [--template router|minimal] [--tailwind | --no-tailwind] [--install] [--force] [--yes]
// Scaffolds a new Keeno project. Asks for anything not given on the command line (unless --yes or no TTY).
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { isEmptyDir, scaffold, TEMPLATES, toPackageName, type Template } from './scaffold'

const HELP = `Usage: create-keeno [dir] [options]

  dir                 where to create the project (default: asked, or keeno-app)
  -t, --template      ${Object.entries(TEMPLATES)
    .map(([k, d]) => `${k}: ${d}`)
    .join('\n                      ')}
  --tailwind          add Tailwind CSS (--no-tailwind to skip)
  --install           install dependencies after scaffolding
  -f, --force         write into a non-empty directory
  -y, --yes           use the defaults for everything not given
`

const color = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code: number) => (s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s)
const bold = paint(1)
const dim = paint(2)
const cyan = paint(36)
const red = paint(31)

function fail(message: string, code = 1): never {
  process.stderr.write(`${red('create-keeno:')} ${message}\n`)
  process.exit(code)
}

// --- arguments
const args = process.argv.slice(2)
if (args.includes('-h') || args.includes('--help')) {
  process.stdout.write(HELP)
  process.exit(0)
}
let dirArg: string | undefined
let template: Template | undefined
let tailwind: boolean | undefined
let install: boolean | undefined
let force = false
let yes = false
for (let i = 0; i < args.length; i++) {
  const a = args[i]!
  if (a === '-t' || a === '--template' || a.startsWith('--template=')) {
    const value = a.includes('=') ? a.slice(a.indexOf('=') + 1) : args[++i]
    if (!value || !(value in TEMPLATES)) fail(`unknown template ${value ?? '(none)'}; use ${Object.keys(TEMPLATES).join(' or ')}`, 2)
    template = value as Template
  } else if (a === '--tailwind') tailwind = true
  else if (a === '--no-tailwind') tailwind = false
  else if (a === '--install') install = true
  else if (a === '--no-install') install = false
  else if (a === '-f' || a === '--force') force = true
  else if (a === '-y' || a === '--yes') yes = true
  else if (a.startsWith('-')) fail(`unknown option ${a}\n\n${HELP}`, 2)
  else if (dirArg === undefined) dirArg = a
  else fail(`unexpected argument ${a}`, 2)
}

// --- prompts
const interactive = !yes && !!process.stdin.isTTY && !!process.stdout.isTTY
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined
rl?.on('SIGINT', () => {
  process.stdout.write('\n')
  process.exit(130)
})

async function text(question: string, fallback: string): Promise<string> {
  if (!rl) return fallback
  const answer = (await rl.question(`${cyan('?')} ${bold(question)} ${dim(`(${fallback})`)} `)).trim()
  return answer || fallback
}

async function confirm(question: string, fallback: boolean): Promise<boolean> {
  if (!rl) return fallback
  for (;;) {
    const answer = (await rl.question(`${cyan('?')} ${bold(question)} ${dim(fallback ? '(Y/n)' : '(y/N)')} `)).trim().toLowerCase()
    if (!answer) return fallback
    if (answer === 'y' || answer === 'yes') return true
    if (answer === 'n' || answer === 'no') return false
  }
}

async function select<T extends string>(question: string, choices: Record<T, string>): Promise<T> {
  const keys = Object.keys(choices) as T[]
  if (!rl) return keys[0]!
  process.stdout.write(`${cyan('?')} ${bold(question)}\n`)
  keys.forEach((k, i) => process.stdout.write(`  ${cyan(String(i + 1))}. ${k} ${dim(`- ${choices[k]}`)}\n`))
  for (;;) {
    const answer = (await rl.question(`  ${dim(`1-${keys.length}`)} ${dim('(1)')} `)).trim()
    if (!answer) return keys[0]!
    const picked = keys[Number(answer) - 1] ?? keys.find((k) => k === answer)
    if (picked) return picked
  }
}

/** The package manager that ran us (`npm create`, `bun create`, …). */
function packageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const agent = process.env.npm_config_user_agent ?? ''
  for (const pm of ['pnpm', 'yarn', 'bun'] as const) if (agent.startsWith(pm)) return pm
  return 'npm'
}

// --- run
process.stdout.write(`\n${bold(cyan('Keeno'))} ${dim('- create a new project')}\n\n`)

const dir = dirArg ?? (await text('Project directory', 'keeno-app'))
const target = path.resolve(dir)
if (!force && !isEmptyDir(target)) {
  const proceed = await confirm(`${dir} is not empty. Write into it anyway?`, false)
  if (!proceed) fail(`${dir} is not empty (use --force to write into it)`)
}
template ??= yes ? 'router' : await select('Template', TEMPLATES)
tailwind ??= await confirm('Add Tailwind CSS?', false)
const pm = packageManager()
install ??= await confirm(`Install dependencies with ${pm}?`, interactive)
rl?.close()

const { files } = scaffold(target, { name: toPackageName(target), template, tailwind })
process.stdout.write(`\n${dim(`Created ${files.length} files in`)} ${target}\n`)

if (install) {
  process.stdout.write(`\n${dim(`$ ${pm} install`)}\n`)
  // Windows needs a shell to run npm.cmd / pnpm.cmd. Node warns about passing args alongside `shell`
  // (DEP0190), so the command goes as one string; `pm` is one of four fixed names.
  const r =
    process.platform === 'win32'
      ? spawnSync(`${pm} install`, { cwd: target, stdio: 'inherit', shell: true })
      : spawnSync(pm, ['install'], { cwd: target, stdio: 'inherit' })
  if (r.status !== 0) fail(`${pm} install failed; run it yourself in ${dir}`)
}

const run = (script: string) => (pm === 'npm' || pm === 'bun' ? `${pm} run ${script}` : `${pm} ${script}`)
const rel = path.relative(process.cwd(), target)
const steps = [rel && `cd ${/\s/.test(rel) ? JSON.stringify(rel) : rel}`, !install && `${pm} install`, run('dev')].filter(Boolean)
process.stdout.write(`\n${bold('Next:')}\n${steps.map((s) => `  ${cyan(s as string)}`).join('\n')}\n\n`)

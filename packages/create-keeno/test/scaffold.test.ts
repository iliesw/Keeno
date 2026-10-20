// Scaffold projects into a temp directory and type-check them with keeno-check, as a new user would.
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { keenoVersions, projectFiles, toPackageName } from '../src/scaffold'

const repo = path.resolve(import.meta.dir, '../../..')
const cli = path.resolve(import.meta.dir, '../src/cli.ts')
const tmp = mkdtempSync(path.join(tmpdir(), 'create-keeno-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

function run(cwd: string, ...args: string[]) {
  const proc = Bun.spawnSync([process.execPath, cli, ...args], { cwd, stdin: 'ignore' })
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() }
}

const pkgOf = (dir: string) => JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
const version = (dir: string) => pkgOf(path.join(repo, 'packages', dir)).version

describe('create-keeno', () => {
  test('Keeno versions come from the workspace packages', () => {
    expect(keenoVersions()).toEqual({
      '@inflector/keeno': `^${version('keeno')}`,
      '@inflector/keeno-router': `^${version('router')}`,
      '@inflector/vite-plugin-keeno': `^${version('vite-plugin-keeno')}`,
      '@inflector/keeno-check': `^${version('keeno-check')}`,
    })
  })

  test('package names are valid npm names', () => {
    expect(toPackageName('My Cool App')).toBe('my-cool-app')
    expect(toPackageName('/some/where/.Hidden_')).toBe('hidden_')
    expect(toPackageName('!!!')).toBe('keeno-app')
  })

  test('the minimal template has no router and no Tailwind', () => {
    const files = projectFiles({ name: 'x', template: 'minimal', tailwind: false })
    expect(Object.keys(files).sort()).toEqual(
      ['.gitignore', '.mcp.json', 'README.md', 'index.html', 'package.json', 'src/App.kn', 'src/app.css', 'src/env.d.ts', 'src/main.ts', 'tsconfig.json', 'vite.config.ts'].sort(),
    )
    const pkg = JSON.parse(files['package.json']!)
    expect(Object.keys(pkg.dependencies)).toEqual(['@inflector/keeno'])
    expect(pkg.devDependencies.tailwindcss).toBeUndefined()
    expect(files['vite.config.ts']).toContain('plugins: [keeno()]')
  })

  test('Tailwind adds the plugin, the import and the dependencies', () => {
    const files = projectFiles({ name: 'x', template: 'router', tailwind: true })
    expect(files['vite.config.ts']).toContain(`keeno({ useFileRouter: true, pages: './src/pages' }), tailwindcss()`)
    expect(files['src/app.css']).toStartWith(`@import 'tailwindcss';`)
    expect(JSON.parse(files['package.json']!).devDependencies).toHaveProperty('@tailwindcss/vite')
  })

  test('a render strategy sets renderStrategy and starts with start()', () => {
    const ssr = projectFiles({ name: 'x', template: 'router', tailwind: false, render: 'ssr' })
    expect(ssr['vite.config.ts']).toContain(`renderStrategy: 'ssr'`)
    expect(ssr['src/main.ts']).toContain(`import { start } from 'virtual:keeno-pages'`)
    expect(ssr['server.js']).toContain('createHandler()')
    const pkg = JSON.parse(ssr['package.json']!)
    expect(pkg.scripts.start).toBe('node server.js')
    expect(pkg.dependencies).toHaveProperty('linkedom')

    const islands = projectFiles({ name: 'x', template: 'router', tailwind: false, render: 'islands' })
    expect(islands['src/pages/index.kn']).toContain('<Counter client="visible" />')
    expect(islands['server.js']).toBeUndefined()

    const spa = projectFiles({ name: 'x', template: 'router', tailwind: false })
    expect(spa['vite.config.ts']).not.toContain('renderStrategy')
    expect(JSON.parse(spa['package.json']!).dependencies).not.toHaveProperty('linkedom')
  })

  test('--render needs a known strategy', () => {
    expect(run(tmp, 'x', '--yes', '--render', 'edge').code).toBe(2)
  })

  test('the CLI writes a router project that keeno-check accepts', () => {
    const { code, out } = run(tmp, 'My App', '--yes')
    expect(code).toBe(0)
    expect(out).toContain('cd "My App"')
    const dir = path.join(tmp, 'My App')
    expect(pkgOf(dir).name).toBe('my-app')
    expect(existsSync(path.join(dir, 'src/pages/_layout.kn'))).toBe(true)

    // Resolve the Keeno packages from the repo, as an install would.
    mkdirSync(path.join(dir, 'node_modules/@inflector'), { recursive: true })
    for (const p of ['keeno', 'router', 'vite-plugin-keeno', 'compiler']) {
      const name = pkgOf(path.join(repo, 'packages', p)).name.split('/')[1]
      symlinkSync(path.join(repo, 'packages', p), path.join(dir, 'node_modules/@inflector', name), 'junction')
    }
    // Their sources, not dist/: CI runs the tests before building the packages.
    const tsconfig = path.join(dir, 'tsconfig.json')
    writeFileSync(tsconfig, readFileSync(tsconfig, 'utf8').replace('"strict": true,', '"strict": true,\n    "customConditions": ["keeno-source"],'))
    symlinkSync(path.join(repo, 'packages/vite-plugin-keeno/node_modules/vite'), path.join(dir, 'node_modules/vite'), 'junction')
    const check = Bun.spawnSync([process.execPath, path.join(repo, 'packages/keeno-check/src/cli.ts'), dir], { cwd: repo })
    expect(check.stdout.toString().replace(/\r\n/g, '\n')).toMatch(/^0 errors in \d+ files\n$/)
    expect(check.exitCode).toBe(0)
  }, 60_000)

  test('a non-empty directory needs --force', () => {
    const dir = path.join(tmp, 'busy')
    mkdirSync(dir)
    writeFileSync(path.join(dir, 'keep.txt'), '')
    expect(run(tmp, 'busy', '--yes').code).toBe(1)
    expect(run(tmp, 'busy', '--yes', '--force', '-t', 'minimal').code).toBe(0)
    expect(existsSync(path.join(dir, 'src/App.kn'))).toBe(true)
  })

  test('bad options are usage errors', () => {
    expect(run(tmp, '--nope').code).toBe(2)
    expect(run(tmp, 'x', '--template', 'vue').code).toBe(2)
  })
})

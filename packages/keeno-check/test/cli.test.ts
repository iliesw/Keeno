// Run the keeno-check CLI as CI would: a clean project exits 0, a broken one lists file:line:col errors and exits 1.
import { describe, expect, test } from 'bun:test'
import path from 'node:path'

const repo = path.resolve(import.meta.dir, '../../..')
const cli = path.resolve(import.meta.dir, '../src/cli.ts')

function run(...args: string[]) {
  const proc = Bun.spawnSync([process.execPath, cli, ...args], { cwd: repo })
  return { code: proc.exitCode, out: proc.stdout.toString().replace(/\r\n/g, '\n') }
}

describe('keeno-check', () => {
  test('the todo example is clean', () => {
    const { code, out } = run('examples/todo')
    expect(out).toMatch(/^0 errors in 6 files\n$/)
    expect(code).toBe(0)
  }, 60_000)

  test('a project with type errors fails with file:line:col output', () => {
    const { code, out } = run('packages/keeno-check/test/fixtures/broken/tsconfig.json')
    const dir = 'packages/keeno-check/test/fixtures/broken'
    expect(out.split('\n').filter((l) => l.includes(' - error '))).toEqual([
      `${dir}/Parent.kn:5:13 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.`,
      `${dir}/Parent.kn:8:22 - error TS2322: Type 'string' is not assignable to type 'number'.`,
    ])
    expect(out).toMatch(/2 errors in 2 files\n$/)
    expect(code).toBe(1)
  }, 60_000)

  test('errors the compiler would throw fail the check, like `vite build` would', () => {
    const { code, out } = run('packages/keeno-check/test/fixtures/compile-error/tsconfig.json')
    const dir = 'packages/keeno-check/test/fixtures/compile-error'
    expect(out.split('\n').filter((l) => l.includes(' - error '))).toEqual([
      `${dir}/Features.kn:6:18 - error keeno: Unsupported .map() row parameter: use an identifier or simple destructuring`,
    ])
    expect(out).toMatch(/1 error in 1 file\n$/)
    expect(code).toBe(1)
  }, 60_000)

  test('the e2e fixture app (router, built-ins, State values) is clean', () => {
    const { code, out } = run('e2e/app')
    expect(out).toMatch(/^0 errors in \d+ files\n$/)
    expect(code).toBe(0)
  }, 60_000)

  test('built-in components type their render callbacks', () => {
    const { code, out } = run('packages/keeno-check/test/fixtures/builtins/tsconfig.json')
    expect(out).toMatch(/^0 errors in 3 files\n$/)
    expect(code).toBe(0)
  }, 60_000)

  test('use: directives type-check their value and element', () => {
    expect(run('packages/keeno-check/test/fixtures/directives/tsconfig.json')).toEqual({ code: 0, out: '0 errors in 2 files\n' })
    const { code, out } = run('packages/keeno-check/test/fixtures/directives-broken/tsconfig.json')
    const dir = 'packages/keeno-check/test/fixtures/directives-broken'
    expect(out.split('\n').filter((l) => l.includes(' - error '))).toEqual([
      `${dir}/Uses.kn:5:24 - error TS2561: Object literal may only specify known properties, but 'txt' does not exist in type '{ text: string; }'. Did you mean to write 'text'?`,
      `${dir}/Uses.kn:6:8 - error TS2322: Type 'KnUse<HTMLTextAreaElement>' is not assignable to type 'KnUse<HTMLInputElement>'.`,
      `${dir}/Uses.kn:7:13 - error TS2345: Argument of type 'Directive<HTMLElement, { text: string; }>' is not assignable to parameter of type '(el: HTMLElement, value?: undefined) => unknown'.`,
    ])
    expect(code).toBe(1)
  }, 60_000)

  test('a missing tsconfig is a usage error', () => {
    expect(run('does/not/exist').code).toBe(2)
  })
})

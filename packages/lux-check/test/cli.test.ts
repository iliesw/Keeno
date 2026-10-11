// Run the lux-check CLI as CI would: a clean project exits 0, a broken one lists file:line:col errors and exits 1.
import { describe, expect, test } from 'bun:test'
import path from 'node:path'

const repo = path.resolve(import.meta.dir, '../../..')
const cli = path.resolve(import.meta.dir, '../src/cli.ts')

function run(...args: string[]) {
  const proc = Bun.spawnSync([process.execPath, cli, ...args], { cwd: repo })
  return { code: proc.exitCode, out: proc.stdout.toString().replace(/\r\n/g, '\n') }
}

describe('lux-check', () => {
  test('the todo example is clean', () => {
    const { code, out } = run('examples/todo')
    expect(out).toMatch(/^0 errors in 3 files\n$/)
    expect(code).toBe(0)
  }, 60_000)

  test('a project with type errors fails with file:line:col output', () => {
    const { code, out } = run('packages/lux-check/test/fixtures/broken/tsconfig.json')
    const dir = 'packages/lux-check/test/fixtures/broken'
    expect(out.split('\n').filter((l) => l.includes(' - error '))).toEqual([
      `${dir}/Parent.lx:5:13 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.`,
      `${dir}/Parent.lx:8:22 - error TS2322: Type 'string' is not assignable to type 'number'.`,
    ])
    expect(out).toMatch(/2 errors in 2 files\n$/)
    expect(code).toBe(1)
  }, 60_000)

  test('the e2e fixture app (router, built-ins, State values) is clean', () => {
    const { code, out } = run('e2e/app')
    expect(out).toMatch(/^0 errors in \d+ files\n$/)
    expect(code).toBe(0)
  }, 60_000)

  test('built-in components type their render callbacks', () => {
    const { code, out } = run('packages/lux-check/test/fixtures/builtins/tsconfig.json')
    expect(out).toMatch(/^0 errors in 3 files\n$/)
    expect(code).toBe(0)
  }, 60_000)

  test('a missing tsconfig is a usage error', () => {
    expect(run('does/not/exist').code).toBe(2)
  })
})

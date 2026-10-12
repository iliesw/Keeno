// Async deriveds, <Loading> and pending().
import { afterEach, describe, expect, test } from 'bun:test'
import { createComponent, mount, type MountedApp } from '../src/component'
import { ErrorBoundary, Loading } from '../src/control'
import { createComputation, derived, pending } from '../src/signal'
import { state } from '../src/state'

const tick = () => new Promise((r) => setTimeout(r, 0))

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let apps: MountedApp[] = []
afterEach(() => {
  for (const a of apps) a.destroy()
  apps = []
  document.body.innerHTML = ''
})

function render(Comp: (p: any) => unknown) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  apps.push(mount(Comp, target, {}))
  return target
}

const loading = (children: () => unknown) =>
  createComponent(Loading, { fallback: () => 'loading…', children })

describe('async derived', () => {
  test('shows the fallback, then the value', async () => {
    const d = deferred<string>()
    const name = derived(async () => d.promise)
    const target = render(() => loading(() => () => `hi ${name.get()}`))
    expect(target.textContent).toBe('loading…')
    d.resolve('ada')
    await tick()
    expect(target.textContent).toBe('hi ada')
  })

  test('re-runs when a dependency changes and ignores superseded results', async () => {
    const id = state(1)
    const calls: { id: number; d: ReturnType<typeof deferred<string>>; signal: AbortSignal }[] = []
    const user = derived(async ({ signal }) => {
      const d = deferred<string>()
      calls.push({ id: id.get(), d, signal })
      return d.promise
    })
    const target = render(() => loading(() => () => user.get()))
    calls[0]!.d.resolve('one')
    await tick()
    expect(target.textContent).toBe('one')

    id.set(2)
    await tick()
    id.set(3)
    await tick()
    expect(calls.map((c) => c.id)).toEqual([1, 2, 3])
    expect(calls[1]!.signal.aborted).toBe(true)
    // Stale while revalidating: the old value stays, no fallback.
    expect(target.textContent).toBe('one')
    calls[2]!.d.resolve('three')
    calls[1]!.d.resolve('two')
    await tick()
    expect(target.textContent).toBe('three')
  })

  test('refresh() and pending()', async () => {
    let n = 0
    let d = deferred<number>()
    const count = derived(async () => (n++, d.promise))
    const target = render(() =>
      loading(() => [() => String(count.get()), () => (pending(() => count.get()) ? ' (refreshing)' : '')]),
    )
    d.resolve(1)
    await tick()
    expect(target.textContent).toBe('1')
    d = deferred<number>()
    count.refresh()
    await tick()
    expect(n).toBe(2)
    expect(target.textContent).toBe('1 (refreshing)')
    d.resolve(2)
    await tick()
    expect(target.textContent).toBe('2')
  })

  test('a rejection goes to the closest ErrorBoundary', async () => {
    const d = deferred<string>()
    const v = derived(async () => d.promise)
    const target = render(() =>
      createComponent(ErrorBoundary, {
        fallback: (e: unknown) => `error: ${(e as Error).message}`,
        children: () => loading(() => () => v.get()),
      }),
    )
    expect(target.textContent).toBe('loading…')
    d.reject(new Error('nope'))
    await tick()
    expect(target.textContent).toBe('error: nope')
  })

  test('refresh() after a rejection, then reset(), shows the fallback and the new value', async () => {
    let d = deferred<string>()
    const v = derived(async () => d.promise)
    let resetBoundary!: () => void
    const target = render(() =>
      createComponent(ErrorBoundary, {
        fallback: (e: unknown, reset: () => void) => ((resetBoundary = reset), `error: ${(e as Error).message}`),
        children: () => loading(() => () => v.get()),
      }),
    )
    d.reject(new Error('nope'))
    await tick()
    expect(target.textContent).toBe('error: nope')
    d = deferred<string>()
    v.refresh()
    resetBoundary()
    await tick()
    expect(target.textContent).toBe('loading…')
    d.resolve('back')
    await tick()
    expect(target.textContent).toBe('back')
  })

  test('siblings inside <Loading> are created once and keep their state', async () => {
    const d = deferred<string>()
    const v = derived(async () => d.promise)
    let created = 0
    const local = state(0)
    const Sibling = () => {
      created++
      return () => `count ${local.get()} `
    }
    const target = render(() => loading(() => [createComponent(Sibling, {}), () => v.get()]))
    local.set(5)
    d.resolve('done')
    await tick()
    expect(target.textContent).toBe('count 5 done')
    expect(created).toBe(1)
  })

  test('a derived of an async derived waits for it', async () => {
    const d = deferred<{ name: string }>()
    const user = derived(async () => d.promise)
    const upper = derived(() => user.get().name.toUpperCase())
    const target = render(() => loading(() => () => upper.get()))
    expect(target.textContent).toBe('loading…')
    d.resolve({ name: 'ada' })
    await tick()
    expect(target.textContent).toBe('ADA')
  })

  test('an async derived that reads a pending one waits for it', async () => {
    const d = deferred<number>()
    const id = derived(async () => d.promise)
    const user = derived(async () => {
      const i = id.get()
      return `user ${i}`
    })
    const target = render(() => loading(() => () => user.get()))
    d.resolve(7)
    await tick()
    await tick()
    expect(target.textContent).toBe('user 7')
  })

  test('outside <Loading>, the region stays empty until the value arrives', async () => {
    const d = deferred<string>()
    const v = derived(async () => d.promise)
    const seen: string[] = []
    createComputation(() => seen.push(v.get()))
    expect(seen).toEqual([])
    d.resolve('x')
    await tick()
    expect(seen).toEqual(['x'])
  })
})

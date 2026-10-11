import { describe, expect, test } from 'bun:test'
import { createComputation, derived, flush, Owner, runWithOwner, Signal } from '../src/signal'
import { state } from '../src/state'

const tick = () => Promise.resolve()

describe('derived', () => {
  test('computes from states', () => {
    const price = state(2)
    const qty = state(3)
    const total = derived(() => price.get() * qty.get())
    expect(total.get()).toBe(6)
    expect(total).toBeInstanceOf(Signal)
  })

  test('is up to date synchronously right after a write (no stale reads)', () => {
    const a = state(1)
    const double = derived(() => a.get() * 2)
    expect(double.get()).toBe(2)
    a.set(5)
    expect(double.get()).toBe(10)
    expect(double.peek()).toBe(10)
  })

  test('is lazy and cached: recomputes only when read after a change', () => {
    const a = state(1)
    let runs = 0
    const d = derived(() => (runs++, a.get() + 1))
    expect(runs).toBe(0)
    d.get()
    d.get()
    expect(runs).toBe(1)
    a.set(2)
    a.set(3)
    expect(runs).toBe(1)
    expect(d.get()).toBe(4)
    expect(runs).toBe(2)
  })

  test('computations re-run when it changes, batched', async () => {
    const a = state(1)
    const d = derived(() => a.get() * 10)
    const seen: number[] = []
    createComputation(() => seen.push(d.get()))
    a.set(2)
    a.set(3)
    await tick()
    expect(seen).toEqual([10, 30])
  })

  test('computations do not re-run when the derived value is unchanged', async () => {
    const n = state(1)
    const positive = derived(() => n.get() > 0)
    let runs = 0
    createComputation(() => {
      runs++
      positive.get()
    })
    n.set(2)
    n.set(3)
    await tick()
    expect(runs).toBe(1)
    n.set(-1)
    await tick()
    expect(runs).toBe(2)
  })

  test('chains of deriveds stay consistent (no glitches)', async () => {
    const a = state(1)
    const b = derived(() => a.get() + 1)
    const c = derived(() => a.get() + b.get())
    const seen: string[] = []
    createComputation(() => seen.push(`${a.get()} ${b.get()} ${c.get()}`))
    a.set(2)
    expect(c.get()).toBe(5)
    await tick()
    expect(seen).toEqual(['1 2 3', '2 3 5'])
  })

  test('dependencies are dynamic', () => {
    const useA = state(true)
    const a = state('a')
    const b = state('b')
    let runs = 0
    const d = derived(() => (runs++, useA.get() ? a.get() : b.get()))
    expect(d.get()).toBe('a')
    useA.set(false)
    expect(d.get()).toBe('b')
    a.set('A') // no longer a dependency
    d.get()
    expect(runs).toBe(2)
  })

  test('custom equals', async () => {
    const list = state([1, 2])
    const len = derived(() => ({ n: list.get().length }), { equals: (x, y) => x.n === y.n })
    let runs = 0
    createComputation(() => {
      runs++
      len.get()
    })
    list.set([3, 4])
    await tick()
    expect(runs).toBe(1)
  })

  test('onUpdate fires synchronously with (old, new)', () => {
    const a = state(1)
    const d = derived(() => a.get() * 2)
    const calls: [number, number][] = []
    d.get()
    d.onUpdate((o, n) => calls.push([o, n]))
    a.set(2)
    expect(calls).toEqual([[2, 4]])
  })

  test('a cycle is reported', () => {
    const d: any = derived(() => d.get() + 1)
    expect(() => d.get()).toThrow(/depends on itself/)
  })

  test('stops tracking when its owner is disposed', () => {
    const a = state(1)
    const owner = new Owner(null)
    const d = runWithOwner(owner, () => derived(() => a.get()))
    d.get()
    owner.dispose()
    expect(a._observers?.size ?? 0).toBe(0)
  })

  test('works through flush()', () => {
    const a = state(1)
    const d = derived(() => a.get() + 1)
    const seen: number[] = []
    createComputation(() => seen.push(d.get()))
    a.set(10)
    flush()
    expect(seen).toEqual([2, 11])
  })
})

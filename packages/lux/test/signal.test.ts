import { describe, expect, test } from 'bun:test'
import { createComputation, flush, memo, untrack, Owner, runWithOwner } from '../src/signal'
import { State, state } from '../src/state'

const tick = () => Promise.resolve()

describe('state', () => {
  test('get / set / peek', () => {
    const s = state(1)
    expect(s.get()).toBe(1)
    s.set(2)
    expect(s.get()).toBe(2)
    expect(s.peek()).toBe(2)
    expect(s).toBeInstanceOf(State)
  })

  test('writes are synchronous', () => {
    const s = state('a')
    s.set('b')
    expect(s.peek()).toBe('b')
  })

  test('state() without a value is undefined', () => {
    expect(state().get()).toBeUndefined()
  })
})

describe('tracking', () => {
  test('a computation re-runs when a state it read changes', async () => {
    const a = state(1)
    const seen: number[] = []
    createComputation(() => seen.push(a.get()))
    expect(seen).toEqual([1])
    a.set(2)
    expect(seen).toEqual([1]) // batched: not yet
    await tick()
    expect(seen).toEqual([1, 2])
  })

  test('peek and untrack do not track', async () => {
    const a = state(1)
    const b = state(1)
    let runs = 0
    createComputation(() => {
      runs++
      a.peek()
      untrack(() => b.get())
    })
    a.set(2)
    b.set(2)
    await tick()
    expect(runs).toBe(1)
  })

  test('dependencies are re-collected on every run', async () => {
    const cond = state(true)
    const a = state('a')
    const b = state('b')
    const seen: string[] = []
    createComputation(() => seen.push(cond.get() ? a.get() : b.get()))
    cond.set(false)
    await tick()
    a.set('A') // no longer a dependency
    await tick()
    b.set('B')
    await tick()
    expect(seen).toEqual(['a', 'b', 'B'])
  })

  test('setting an equal value (Object.is) does nothing', async () => {
    const a = state(NaN)
    let runs = 0
    createComputation(() => {
      runs++
      a.get()
    })
    a.set(NaN)
    await tick()
    expect(runs).toBe(1)
  })
})

describe('batching', () => {
  test('many writes cause one re-run per microtask', async () => {
    const a = state(0)
    const b = state(0)
    const seen: number[] = []
    createComputation(() => seen.push(a.get() + b.get()))
    a.set(1)
    a.set(2)
    b.set(10)
    await tick()
    expect(seen).toEqual([0, 12])
  })

  test('flush() runs pending work synchronously', () => {
    const a = state(0)
    const seen: number[] = []
    createComputation(() => seen.push(a.get()))
    a.set(5)
    flush()
    expect(seen).toEqual([0, 5])
  })

  test('render computations run before user computations', async () => {
    const a = state(0)
    const order: string[] = []
    createComputation(() => {
      a.get()
      order.push('user')
    }, 'user')
    createComputation(() => {
      a.get()
      order.push('render')
    }, 'render')
    order.length = 0
    a.set(1)
    await tick()
    expect(order).toEqual(['render', 'user'])
  })

  test('an infinite loop is reported', () => {
    const a = state(0)
    createComputation(() => a.set(a.get() + 1))
    expect(() => flush()).toThrow(/loop/)
  })
})

describe('onUpdate', () => {
  test('runs synchronously with (old, new) on every real change', () => {
    const a = state(1)
    const calls: [number, number][] = []
    a.onUpdate((o, n) => calls.push([o, n]))
    a.set(2)
    a.set(2)
    a.set(3)
    expect(calls).toEqual([
      [1, 2],
      [2, 3],
    ])
  })

  test('returns an unsubscribe function', () => {
    const a = state(1)
    let n = 0
    const off = a.onUpdate(() => n++)
    a.set(2)
    off()
    a.set(3)
    expect(n).toBe(1)
  })

  test('is removed when its owner is disposed', () => {
    const a = state(1)
    let n = 0
    const owner = new Owner(null)
    runWithOwner(owner, () => a.onUpdate(() => n++))
    a.set(2)
    owner.dispose()
    a.set(3)
    expect(n).toBe(1)
  })
})

describe('memo', () => {
  test('downstream re-runs only when the memo value changes', async () => {
    const a = state(1)
    const positive = memo(() => a.get() > 0)
    let runs = 0
    createComputation(() => {
      runs++
      positive()
    })
    a.set(2)
    await tick()
    expect(runs).toBe(1)
    a.set(-1)
    await tick()
    expect(runs).toBe(2)
  })

  test('memos update before render computations read them (no glitch)', async () => {
    const a = state(1)
    const double = memo(() => a.get() * 2)
    const seen: string[] = []
    createComputation(() => seen.push(`${a.get()}:${double()}`))
    a.set(2)
    await tick()
    expect(seen).toEqual(['1:2', '2:4'])
  })
})

describe('owners', () => {
  test('a re-run disposes what the previous run created', async () => {
    const a = state(0)
    const log: string[] = []
    createComputation(() => {
      const v = a.get()
      const child = new Owner()
      ;(child.cleanups ??= []).push(() => log.push(`cleanup ${v}`))
    })
    a.set(1)
    await tick()
    expect(log).toEqual(['cleanup 0'])
  })

  test('disposed computations stop reacting', async () => {
    const a = state(0)
    let runs = 0
    const c = createComputation(() => {
      runs++
      a.get()
    })
    c.dispose()
    a.set(1)
    await tick()
    expect(runs).toBe(1)
  })
})

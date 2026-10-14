import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createComputation, Owner, pending, runWithOwner } from '../src/signal'
import { deepEqual, State, state } from '../src/state'

const tick = () => Promise.resolve()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('equals', () => {
  test('a custom equality replaces Object.is', () => {
    const s = state({ a: 1 }, { equals: deepEqual })
    let n = 0
    s.onUpdate(() => n++)
    s.set({ a: 1 })
    expect(n).toBe(0)
    s.set({ a: 2 })
    expect(n).toBe(1)
  })

  test('deepEqual', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
    expect(deepEqual(new Date(1), new Date(1))).toBe(true)
    expect(deepEqual(NaN, NaN)).toBe(true)
    expect(deepEqual([1], { 0: 1 })).toBe(false)
  })
})

describe('validate', () => {
  const clamp = (v: number) => Math.min(10, Math.max(0, v))

  test('coerces writes and the initial value', () => {
    const s = state(50, { validate: clamp })
    expect(s.get()).toBe(10)
    s.set(-5)
    expect(s.get()).toBe(0)
  })

  test('rejects a write by returning prev', () => {
    const s = state(1, { validate: (v, prev) => (Number.isNaN(v) ? prev : v) })
    let n = 0
    s.onUpdate(() => n++)
    s.set(NaN)
    expect(s.get()).toBe(1)
    expect(n).toBe(0)
  })
})

describe('history', () => {
  test('undo / redo / canUndo / canRedo', () => {
    const s = state('a', { history: 10 })
    expect(s.canUndo).toBe(false)
    s.set('b')
    s.set('c')
    expect(s.canUndo).toBe(true)
    s.undo()
    expect(s.get()).toBe('b')
    expect(s.canRedo).toBe(true)
    s.undo()
    expect(s.get()).toBe('a')
    expect(s.canUndo).toBe(false)
    s.undo() // no-op
    s.redo()
    expect(s.get()).toBe('b')
    s.set('x') // a new write clears the redo stack
    expect(s.canRedo).toBe(false)
  })

  test('keeps at most `history` past values', () => {
    const s = state(0, { history: 2 })
    for (let i = 1; i <= 5; i++) s.set(i)
    s.undo()
    s.undo()
    s.undo()
    expect(s.get()).toBe(3)
  })

  test('canUndo / canRedo are reactive', async () => {
    const s = state(0, { history: 5 })
    const seen: string[] = []
    createComputation(() => seen.push(`${s.canUndo}/${s.canRedo}`))
    s.set(1)
    await tick()
    s.undo()
    await tick()
    expect(seen).toEqual(['false/false', 'true/false', 'false/true'])
  })

  test('undo notifies like a normal write', () => {
    const s = state(1, { history: 5 })
    const calls: number[][] = []
    s.set(2)
    s.onUpdate((o, n) => calls.push([o, n]))
    s.undo()
    expect(calls).toEqual([[2, 1]])
  })

  test('without the option, undo is a no-op', () => {
    const s = state(1)
    s.set(2)
    s.undo()
    expect(s.get()).toBe(2)
    expect(s.canUndo).toBe(false)
  })
})

describe('debounce / throttle', () => {
  test('debounce applies the last write after a pause', async () => {
    const s = state('', { debounce: 30 })
    const seen: string[] = []
    s.onUpdate((_, n) => seen.push(n))
    s.set('a')
    s.set('ab')
    s.set('abc')
    expect(s.get()).toBe('')
    expect(s._isPending()).toBe(true)
    await sleep(60)
    expect(s.get()).toBe('abc')
    expect(seen).toEqual(['abc'])
    expect(s._isPending()).toBe(false)
  })

  test('throttle applies the first write now and the last one later', async () => {
    const s = state(0, { throttle: 40 })
    const seen: number[] = []
    s.onUpdate((_, n) => seen.push(n))
    s.set(1)
    s.set(2)
    s.set(3)
    expect(seen).toEqual([1])
    await sleep(80)
    expect(seen).toEqual([1, 3])
  })

  test('both at once is an error', () => {
    expect(() => state(0, { debounce: 1, throttle: 1 })).toThrow(/either/)
  })

  test('a pending debounced write is dropped when its owner is disposed', async () => {
    const owner = new Owner(null)
    const s = runWithOwner(owner, () => state(0, { debounce: 20 }))
    s.set(1)
    owner.dispose()
    await sleep(40)
    expect(s.get()).toBe(0)
  })
})

describe('persist', () => {
  beforeEach(() => localStorage.clear())

  test('loads from and saves to localStorage', () => {
    localStorage.setItem('todos', JSON.stringify(['saved']))
    const s = state<string[]>([], { persist: 'todos' })
    expect(s.get()).toEqual(['saved'])
    s.set(['a', 'b'])
    expect(JSON.parse(localStorage.getItem('todos')!)).toEqual(['a', 'b'])
  })

  test('loaded values go through validate; bad JSON is ignored', () => {
    localStorage.setItem('n', '999')
    expect(state(1, { persist: 'n', validate: (v) => Math.min(v, 10) }).get()).toBe(10)
    localStorage.setItem('bad', '{oops')
    expect(state('fallback', { persist: 'bad' }).get()).toBe('fallback')
  })

  test('syncs across tabs through BroadcastChannel', async () => {
    const tab1 = state('x', { persist: 'shared' })
    const tab2 = state('x', { persist: 'shared' })
    tab1.set('from tab 1')
    await sleep(30)
    expect(tab2.get()).toBe('from tab 1')
    tab2.set('from tab 2')
    await sleep(30)
    expect(tab1.get()).toBe('from tab 2')
    tab1._channel?.close()
    tab2._channel?.close()
  })
})

describe('url', () => {
  const reset = () => history.replaceState(null, '', '/')
  beforeEach(reset)
  afterEach(reset)

  test('reads the initial value from the query, typed like the default', () => {
    history.replaceState(null, '', '/?q=hello&page=3&open=true&tags=%5B%22a%22%5D')
    expect(state('', { url: 'q' }).get()).toBe('hello')
    expect(state(1, { url: 'page' }).get()).toBe(3)
    expect(state(false, { url: 'open' }).get()).toBe(true)
    expect(state<string[]>([], { url: 'tags' }).get()).toEqual(['a'])
    expect(state(1, { url: 'missing' }).get()).toBe(1)
  })

  test('invalid numbers fall back to the default', () => {
    history.replaceState(null, '', '/?page=abc')
    expect(state(1, { url: 'page' }).get()).toBe(1)
  })

  test('writes push one history entry per tick; the default removes the param', async () => {
    const q = state('', { url: 'q' })
    const page = state(1, { url: 'page' })
    const before = history.length
    q.set('keeno')
    page.set(2)
    await tick()
    expect(location.search).toBe('?q=keeno&page=2')
    expect(history.length).toBe(before + 1)
    q.set('')
    await tick()
    expect(location.search).toBe('?page=2')
  })

  test('replace: true does not add history entries', async () => {
    const q = state('', { url: { param: 'r', replace: true } })
    const before = history.length
    q.set('a')
    await tick()
    expect(location.search).toBe('?r=a')
    expect(history.length).toBe(before)
  })

  test('popstate (back / forward) restores the value without pushing', async () => {
    const q = state('', { url: 'q' })
    q.set('one')
    await tick()
    q.set('two')
    await tick()
    const len = history.length
    history.replaceState(null, '', '/?q=one') // what the browser shows after "back"
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(q.get()).toBe('one')
    await tick()
    expect(history.length).toBe(len)
    history.replaceState(null, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(q.get()).toBe('')
  })
})

describe('options compose', () => {
  test('history + validate + persist', () => {
    localStorage.clear()
    const s = state(5, { history: 5, validate: (v) => Math.max(0, v), persist: 'combo' })
    s.set(-3)
    expect(s.get()).toBe(0)
    s.undo()
    expect(s.get()).toBe(5)
    expect(localStorage.getItem('combo')).toBe('5')
    s._channel?.close()
  })

  test('State instances keep working with the plain constructor', () => {
    expect(new State(1).get()).toBe(1)
  })
})

describe('save', () => {
  const deferred = <T = unknown>() => {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)))
    return { promise, resolve, reject }
  }

  test('applies the write at once and calls save with next, prev', () => {
    const calls: unknown[] = []
    const s = state(1, { save: (next, prev) => void calls.push([next, prev]) })
    s.set(2)
    expect(s.get()).toBe(2)
    expect(calls).toEqual([[2, 1]])
  })

  test('rolls back to the last saved value when save rejects', async () => {
    const d = deferred()
    const errors: unknown[] = []
    const owner = new Owner(null)
    owner.onError = (e) => void errors.push(e)
    const s = runWithOwner(owner, () => state('a', { save: () => d.promise }))
    s.set('b')
    expect(s.get()).toBe('b')
    d.reject(new Error('nope'))
    await tick()
    await tick()
    expect(s.get()).toBe('a')
    expect((errors[0] as Error).message).toBe('nope')
  })

  test('a newer write aborts the older save and wins', async () => {
    const first = deferred()
    const second = deferred()
    const signals: AbortSignal[] = []
    const pendingSaves = [first, second]
    const s = state(0, {
      save: (_n, _p, { signal }) => {
        signals.push(signal)
        return pendingSaves.shift()!.promise
      },
    })
    s.set(1)
    s.set(2)
    expect(signals[0].aborted).toBe(true)
    first.reject(new Error('stale'))
    await tick()
    expect(s.get()).toBe(2)
    second.resolve(undefined)
    await tick()
    expect(s.get()).toBe(2)
  })

  test('resolving with a value replaces the state', async () => {
    const s = state({ id: 0, title: 'x' }, { save: async (next) => ({ ...next, id: 42 }) })
    s.set({ id: 0, title: 'y' })
    await tick()
    await tick()
    expect(s.get()).toEqual({ id: 42, title: 'y' })
  })

  test('pending() is true while saving', async () => {
    const d = deferred()
    const s = state(0, { save: () => d.promise })
    const seen: boolean[] = []
    const owner = new Owner(null)
    runWithOwner(owner, () => createComputation(() => void seen.push(pending(() => s.get()))))
    s.set(1)
    await tick()
    d.resolve(undefined)
    await tick()
    await tick()
    expect(seen).toEqual([false, true, false])
    owner.dispose()
  })

  test('undo saves too; remote writes do not', () => {
    const calls: unknown[] = []
    const s = state(1, { history: 5, save: (next) => void calls.push(next) })
    s.set(2)
    s.undo()
    s._write(9, 'remote')
    expect(calls).toEqual([2, 1])
  })
})

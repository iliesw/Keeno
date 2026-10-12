// store(): per-property tracking, arrays, keyed lists, bind, snapshot and reconcile.
import { afterEach, describe, expect, test } from 'bun:test'
import { mount, type MountedApp } from '../src/component'
import { bind, bindPath, insert, mapKeyed } from '../src/dom'
import { createComputation, derived } from '../src/signal'
import { state } from '../src/state'
import { isStore, reconcile, snapshot, store } from '../src/store'

const tick = () => Promise.resolve()

let apps: MountedApp[] = []
afterEach(() => {
  for (const a of apps) a.destroy()
  apps = []
  document.body.innerHTML = ''
})

describe('store', () => {
  test('reads and writes like a plain object', () => {
    const s = store({ user: { name: 'ada', tags: ['a'] } })
    s.user.name = 'grace'
    s.user.tags.push('b')
    expect(s.user.name).toBe('grace')
    expect(s.user.tags).toEqual(['a', 'b'])
    expect(isStore(s.user)).toBe(true)
    expect(s.user).toBe(s.user) // one proxy per object
  })

  test('only readers of the changed property re-run', async () => {
    const s = store({ a: 1, b: { c: 2 } })
    let aRuns = 0
    let cRuns = 0
    createComputation(() => (aRuns++, s.a))
    createComputation(() => (cRuns++, s.b.c))
    s.b.c = 3
    await tick()
    expect([aRuns, cRuns]).toEqual([1, 2])
    s.a = 1 // same value: nothing
    s.a = 5
    await tick()
    expect([aRuns, cRuns]).toEqual([2, 2])
  })

  test('replacing a nested object notifies readers below it', async () => {
    const s = store({ b: { c: 1 } })
    const seen: number[] = []
    createComputation(() => seen.push(s.b.c))
    s.b = { c: 9 }
    await tick()
    expect(seen).toEqual([1, 9])
  })

  test('array mutations re-run iteration once per batch', async () => {
    const s = store({ items: [1, 2] })
    let runs = 0
    let sum = 0
    createComputation(() => {
      runs++
      sum = s.items.reduce((a, b) => a + b, 0)
    })
    s.items.push(3)
    s.items.push(4)
    s.items.splice(0, 1)
    await tick()
    expect(runs).toBe(2)
    expect(sum).toBe(9)
  })

  test('adding and deleting keys re-runs Object.keys and `in`', async () => {
    const s = store<Record<string, number>>({ a: 1 })
    const seen: string[] = []
    let has = false
    createComputation(() => seen.push(Object.keys(s).join(',')))
    createComputation(() => (has = 'b' in s))
    s.b = 2
    await tick()
    expect(has).toBe(true)
    delete s.a
    await tick()
    expect(seen).toEqual(['a', 'a,b', 'b'])
  })

  test('derived over a store', () => {
    const s = store({ todos: [{ done: false }, { done: true }] })
    const left = derived(() => s.todos.filter((t) => !t.done).length)
    expect(left.get()).toBe(1)
    s.todos[0]!.done = true
    expect(left.get()).toBe(0)
  })

  test('non-plain values are kept as they are', () => {
    const d = new Date(0)
    const m = new Map()
    const s = store({ d, m })
    expect(s.d).toBe(d)
    expect(s.m).toBe(m)
    expect(() => store(new Date() as any)).toThrow(/plain object/)
  })

  test('keyed lists follow pushes, reorders and fine-grained item changes', async () => {
    const s = store({ items: [{ id: 1, title: 'a' }, { id: 2, title: 'b' }] })
    const target = document.createElement('ul')
    let rendered = 0
    apps.push(
      mount(
        () =>
          mapKeyed(
            () => s.items,
            (item) => item.id,
            (item) => {
              rendered++
              const li = document.createElement('li')
              insert(li, () => item.get().title)
              return li
            },
          ),
        target,
      ),
    )
    const text = () => [...target.children].map((li) => li.textContent).join(',')
    expect(text()).toBe('a,b')
    s.items.push({ id: 3, title: 'c' })
    await tick()
    expect(text()).toBe('a,b,c')
    s.items.reverse()
    await tick()
    expect(text()).toBe('c,b,a')
    s.items[0]!.title = 'C'
    await tick()
    expect(text()).toBe('C,b,a')
    expect(rendered).toBe(3) // rows were reused, not re-rendered
  })

  test('bind:value on a store property', async () => {
    const form = store({ user: { name: 'ada' } })
    const input = document.createElement('input')
    apps.push(mount(() => (bind(input, 'value', bindPath(() => form.user, () => 'name')), null), document.createElement('div')))
    expect(input.value).toBe('ada')
    input.value = 'grace'
    input.dispatchEvent(new Event('input'))
    expect(form.user.name).toBe('grace')
    form.user.name = 'linus'
    await tick()
    expect(input.value).toBe('linus')
  })

  test('bindPath to a state still binds the state', () => {
    const fields = { name: state('x') }
    const input = document.createElement('input')
    apps.push(mount(() => (bind(input, 'value', bindPath(() => fields, () => 'name')), null), document.createElement('div')))
    input.value = 'y'
    input.dispatchEvent(new Event('input'))
    expect(fields.name.peek()).toBe('y')
  })

  test('bindPath on a plain object throws', () => {
    const input = document.createElement('input')
    const plain = { name: 'x' }
    expect(() => mount(() => (bind(input, 'value', bindPath(() => plain, () => 'name')), null), document.createElement('div'))).toThrow(
      /state or a property of a store/,
    )
  })

  test('snapshot is a plain, detached copy', () => {
    const s = store({ a: { b: [1, { c: 2 }] } })
    const snap = snapshot(s)
    expect(isStore(snap)).toBe(false)
    expect(isStore(snap.a)).toBe(false)
    expect(snap).toEqual({ a: { b: [1, { c: 2 }] } })
    s.a.b.push(3)
    expect(snap.a.b.length).toBe(2)
  })

  test('snapshot read in a computation tracks the whole store', async () => {
    const s = store({ a: { b: [{ c: 1 }] } })
    const seen: string[] = []
    createComputation(() => seen.push(JSON.stringify(snapshot(s))))
    s.a.b[0]!.c = 2
    await tick()
    s.a.b.push({ c: 3 })
    await tick()
    expect(seen).toEqual(['{"a":{"b":[{"c":1}]}}', '{"a":{"b":[{"c":2}]}}', '{"a":{"b":[{"c":2},{"c":3}]}}'])
  })
})

describe('reconcile', () => {
  test('changes only what differs, matching array items by id', async () => {
    const s = store({ items: [{ id: 1, title: 'a' }, { id: 2, title: 'b' }] })
    const first = s.items[0]
    let titleRuns = 0
    createComputation(() => (titleRuns++, s.items[0]!.title))
    reconcile(s, { items: [{ id: 1, title: 'a' }, { id: 2, title: 'B' }, { id: 3, title: 'c' }] })
    await tick()
    expect(titleRuns).toBe(1)
    expect(s.items[0]).toBe(first)
    expect(snapshot(s.items)).toEqual([
      { id: 1, title: 'a' },
      { id: 2, title: 'B' },
      { id: 3, title: 'c' },
    ])
    reconcile(s.items, [{ id: 2, title: 'B' }])
    expect(snapshot(s.items)).toEqual([{ id: 2, title: 'B' }])
  })

  test('removes keys that are gone', () => {
    const s = store<{ a?: number; b: number }>({ a: 1, b: 2 })
    reconcile(s, { b: 3 })
    expect(snapshot(s)).toEqual({ b: 3 })
  })
})

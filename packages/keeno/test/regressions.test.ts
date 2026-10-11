import { afterEach, describe, expect, test } from 'bun:test'
import { and, attr, bind, getDocument, insert, spread } from '../src/dom'
import { renderToString } from '../src/server'
import { Owner, createComputation, derived, flush, runWithOwner } from '../src/signal'
import { state } from '../src/state'

let roots: Owner[] = []
afterEach(() => {
  for (const r of roots) r.dispose()
  roots = []
})

function root<T>(fn: () => T): T {
  const r = new Owner(null)
  roots.push(r)
  return runWithOwner(r, fn)
}

describe('scheduler', () => {
  test('a child computation does not run after its condition turns false', () => {
    const user = state<{ name: string } | null>({ name: 'Ada' })
    const el = document.createElement('div')
    root(() =>
      insert(
        el,
        and(
          () => user.get(),
          () => {
            const p = document.createElement('p')
            createComputation(() => {
              p.textContent = user.get()!.name
            })
            return p
          },
        ),
      ),
    )
    expect(el.textContent).toBe('Ada')
    user.set(null)
    expect(() => flush()).not.toThrow()
    expect(el.textContent).toBe('')
    user.set({ name: 'Grace' })
    flush()
    expect(el.textContent).toBe('Grace')
  })
})

describe('derived errors', () => {
  test('a derived that throws on its first run notifies readers when it recovers', () => {
    const ok = state(false)
    const d = derived(() => {
      if (!ok.get()) throw new Error('nope')
      return 'yes'
    })
    let seen = ''
    root(() =>
      createComputation(() => {
        try {
          seen = d.get()
        } catch {
          seen = 'err'
        }
      }),
    )
    expect(seen).toBe('err')
    ok.set(true)
    flush()
    expect(seen).toBe('yes')
  })

  test('an onUpdate listener that throws does not stop computations', () => {
    const s = state(1)
    s.onUpdate(() => {
      throw new Error('listener')
    })
    let seen = 0
    root(() => createComputation(() => (seen = s.get())))
    expect(() => s.set(2)).toThrow('listener')
    flush()
    expect(seen).toBe(2)
  })
})

describe('attributes and events', () => {
  test('spread binds onclick-style keys as listeners, not inline handlers', () => {
    const el = document.createElement('button')
    let clicks = 0
    root(() => spread(el, { onclick: () => clicks++, onDoubleClick: () => (clicks += 10) }))
    expect(el.getAttribute('onclick')).toBeNull()
    el.dispatchEvent(new Event('click'))
    el.dispatchEvent(new Event('dblclick'))
    expect(clicks).toBe(11)
  })

  test('dynamic inline handlers are never set as attributes', () => {
    const el = document.createElement('div')
    const err = console.error
    console.error = () => {}
    try {
      root(() => spread(el, { onclick: 'alert(1)' }))
      root(() => attr(el, 'onmouseover', () => 'alert(1)'))
    } finally {
      console.error = err
    }
    expect(el.getAttribute('onclick')).toBeNull()
    expect(el.getAttribute('onmouseover')).toBeNull()
  })
})

describe('server rendering', () => {
  test('select value and checked are rendered as attributes', async () => {
    const choice = state('b')
    const on = state(true)
    const html = await renderToString(() => {
      const doc = getDocument()
      const sel = doc.createElement('select')
      for (const v of ['a', 'b']) {
        const o = doc.createElement('option')
        o.setAttribute('value', v)
        o.textContent = v
        sel.appendChild(o)
      }
      bind(sel, 'value', choice)
      const box = doc.createElement('input')
      box.setAttribute('type', 'checkbox')
      bind(box, 'checked', on)
      const frag = doc.createElement('div')
      frag.append(sel, box)
      return frag
    })
    expect(html).toContain('<option selected value="b">')
    expect(html).toContain('<input checked type="checkbox">')
  })
})

describe('cleanup and history', () => {
  test('undo keeps the history when validate refuses the old value', () => {
    let allowOdd = true
    const s = state(1, { history: 10, validate: (v, prev) => (allowOdd || v % 2 === 0 ? v : prev) })
    s.set(2)
    allowOdd = false
    s.undo()
    expect(s.peek()).toBe(2)
    expect(s.canUndo).toBe(true)
    expect(s.canRedo).toBe(false)
  })

  test('a lazy failure only shows in the instances that were waiting for it', async () => {
    const { lazy, ErrorBoundary } = await import('../src/control')
    const { createComponent } = await import('../src/component')
    let fail = true
    const Lazy = lazy(async () => {
      if (fail) throw new Error('load')
      return () => 'ok'
    })
    const a = document.createElement('div')
    root(() => insert(a, () => createComponent(ErrorBoundary, { fallback: 'failed', children: () => createComponent(Lazy, {}) })))
    await new Promise((r) => setTimeout(r, 0))
    flush()
    expect(a.textContent).toBe('failed')
    fail = false
    const b = document.createElement('div')
    root(() => insert(b, () => createComponent(Lazy, {})))
    await new Promise((r) => setTimeout(r, 0))
    flush()
    expect(b.textContent).toBe('ok')
    expect(a.textContent).toBe('failed')
  })

  test('mount cleans up when the first render throws', async () => {
    const { mount } = await import('../src/component')
    const s = state(0)
    let runs = 0
    const el = document.createElement('div')
    expect(() =>
      mount(() => {
        createComputation(() => {
          s.get()
          runs++
        })
        throw new Error('boom')
      }, el),
    ).toThrow('boom')
    s.set(1)
    flush()
    expect(runs).toBe(1)
  })

  test('portals are rendered after the app on the server', async () => {
    const { Portal } = await import('../src/control')
    const { createComponent } = await import('../src/component')
    const html = await renderToString(() => [
      'app',
      createComponent(Portal, { target: '#modals', children: () => 'modal' }),
    ])
    expect(html).toBe('app<div data-keeno-portal="#modals">modal</div>')
  })
})

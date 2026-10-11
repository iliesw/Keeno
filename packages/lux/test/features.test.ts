// Error boundaries, context, Dynamic, Portal, Await, lazy, Transition, URL safety, SSR and dev tools.
import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { parseHTML } from 'linkedom'
import { createComponent, hydrate, inspect, mount, type MountedApp } from '../src/component'
import { createContext, inject, provide } from '../src/context'
import { Await, ErrorBoundary, Portal, lazy } from '../src/control'
import { attr, mapKeyed } from '../src/dom'
import { init, update } from '../src/lifecycle'
import { renderToString, renderToStringWith } from '../src/server'
import { derived, flush, Owner, runWithOwner } from '../src/signal'
import { state } from '../src/state'
import { Transition } from '../src/transition'
import { Dynamic } from '../src/component'

const tick = () => new Promise((r) => setTimeout(r, 0))
const h = (tag: string, text: unknown) => {
  const el = document.createElement(tag)
  el.textContent = String(text)
  return el
}

let apps: MountedApp[] = []
afterEach(() => {
  for (const a of apps) a.destroy()
  apps = []
  document.body.innerHTML = ''
})

function render(Comp: (p: any) => unknown, props: Record<string, any> = {}) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  apps.push(mount(Comp, target, props))
  return target
}

const boundary = (children: () => unknown, extra: Record<string, any> = {}) =>
  createComponent(ErrorBoundary, {
    fallback: (e: unknown, reset: () => void) => {
      const b = h('button', `error: ${(e as Error).message}`)
      b.onclick = reset
      return b
    },
    children,
    ...extra,
  })

describe('ErrorBoundary', () => {
  test('catches an error thrown while creating a child', () => {
    const Boom = () => {
      throw new Error('create')
    }
    const el = render(() => [h('p', 'before'), boundary(() => createComponent(Boom, {}))])
    expect(el.textContent).toBe('beforeerror: create')
  })

  test('catches errors in reactive regions, init and update', async () => {
    const n = state(0)
    const Region = () => () => {
      if (n.get() === 1) throw new Error('region')
      return `n=${n.get()}`
    }
    const el = render(() => boundary(() => createComponent(Region, {})))
    expect(el.textContent).toBe('n=0')
    n.set(1)
    await tick()
    expect(el.textContent).toBe('error: region')

    const InInit = () => {
      init(() => {
        throw new Error('init')
      })
      return 'x'
    }
    expect(render(() => boundary(() => createComponent(InInit, {}))).textContent).toBe('error: init')

    const m = state(0)
    const InUpdate = () => {
      update(() => {
        if (m.get() > 0) throw new Error('update')
      })
      return 'ok'
    }
    const el3 = render(() => boundary(() => createComponent(InUpdate, {})))
    expect(el3.textContent).toBe('ok')
    m.set(1)
    await tick()
    expect(el3.textContent).toBe('error: update')
  })

  test('reset renders the children again; onError sees each error', async () => {
    const fail = state(true)
    const errors: unknown[] = []
    const Maybe = () => {
      if (fail.peek()) throw new Error('once')
      return 'recovered'
    }
    const el = render(() => boundary(() => createComponent(Maybe, {}), { onError: (e: unknown) => errors.push(e) }))
    expect(el.textContent).toBe('error: once')
    fail.set(false)
    el.querySelector('button')!.click()
    await tick()
    expect(el.textContent).toBe('recovered')
    expect(errors).toHaveLength(1)
  })

  test('an error in the fallback goes to the outer boundary', () => {
    const Boom = () => {
      throw new Error('inner')
    }
    const inner = () =>
      createComponent(ErrorBoundary, {
        fallback: () => {
          throw new Error('fallback')
        },
        children: () => createComponent(Boom, {}),
      })
    const el = render(() => boundary(inner))
    expect(el.textContent).toBe('error: fallback')
  })

  test('without a boundary the error is thrown', () => {
    const Boom = () => {
      throw new Error('unhandled')
    }
    expect(() => render(() => createComponent(Boom, {}))).toThrow('unhandled')
  })

  test('a derived that throws recovers when its sources change', async () => {
    const n = state(1)
    const d = derived(() => {
      if (n.get() < 0) throw new Error('negative')
      return n.get() * 2
    })
    const el = render(() => boundary(() => () => `d=${d.get()}`))
    expect(el.textContent).toBe('d=2')
    n.set(-1)
    await tick()
    expect(el.textContent).toBe('error: negative')
    n.set(3)
    expect(d.get()).toBe(6)
  })
})

describe('context', () => {
  const Theme = createContext('light')

  test('inject finds the closest provider, through lists and reactive regions', async () => {
    const items = state([1, 2])
    const Leaf = () => `${inject(Theme)};`
    const Middle = () => {
      provide(Theme, 'blue')
      return () => mapKeyed(() => items.get(), (i) => i, () => createComponent(Leaf, {}))
    }
    const App = () => [createComponent(Leaf, {}), createComponent(Middle, {})]
    const root = new Owner(null)
    const el = render(() => {
      provide(Theme, 'dark')
      return createComponent(App, {})
    })
    root.dispose()
    expect(el.textContent).toBe('dark;blue;blue;')
    items.set([1, 2, 3])
    await tick()
    expect(el.textContent).toBe('dark;blue;blue;blue;')
  })

  test('inject returns the default without a provider; provide needs an owner', () => {
    expect(render(() => inject(Theme)).textContent).toBe('light')
    expect(() => provide(Theme, 'x')).toThrow('provide()')
  })
})

describe('Dynamic', () => {
  test('renders the component in `component` and re-creates it when it changes', async () => {
    const A = (p: { label: string }) => `A:${p.label}`
    const B = (p: { label: string }) => `B:${p.label}`
    const which = state<any>(A)
    const el = render(() =>
      createComponent(Dynamic, {
        get component() {
          return which.get()
        },
        label: 'x',
      }),
    )
    expect(el.textContent).toBe('A:x')
    which.set(B)
    await tick()
    expect(el.textContent).toBe('B:x')
    which.set(null)
    await tick()
    expect(el.textContent).toBe('')
  })
})

describe('Portal', () => {
  test('renders into the target and removes its nodes on destroy', () => {
    const modal = document.createElement('div')
    modal.id = 'modal'
    document.body.appendChild(modal)
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(() => ['inline', createComponent(Portal, { target: '#modal', children: () => h('p', 'ported') })], target)
    expect(target.textContent).toBe('inline')
    expect(modal.innerHTML).toBe('<p>ported</p>')
    app.destroy()
    expect(modal.innerHTML).toBe('')
  })

  test('a missing target is an error', () => {
    expect(() => render(() => createComponent(Portal, { target: '#nope', children: () => 'x' }))).toThrow('no element matches')
  })
})

describe('Await', () => {
  test('pending, fulfilled, and a replaced promise is ignored', async () => {
    let resolveA!: (v: string) => void
    let resolveB!: (v: string) => void
    const a = new Promise<string>((r) => (resolveA = r))
    const b = new Promise<string>((r) => (resolveB = r))
    const which = state(a)
    const el = render(() =>
      createComponent(Await, {
        get promise() {
          return which.get()
        },
        pending: () => 'loading',
        fulfilled: (v: string) => `got ${v}`,
      }),
    )
    expect(el.textContent).toBe('loading')
    which.set(b)
    resolveA('a')
    await tick()
    expect(el.textContent).toBe('loading')
    resolveB('b')
    await tick()
    expect(el.textContent).toBe('got b')
  })

  test('rejected renders `rejected`, or goes to the error boundary', async () => {
    const el = render(() =>
      createComponent(Await, { promise: Promise.reject(new Error('no')), rejected: (e: unknown) => `failed: ${(e as Error).message}` }),
    )
    await tick()
    expect(el.textContent).toBe('failed: no')

    const el2 = render(() => boundary(() => createComponent(Await, { promise: Promise.reject(new Error('nope')) })))
    await tick()
    expect(el2.textContent).toBe('error: nope')
  })

  test('a plain value renders immediately', () => {
    expect(render(() => createComponent(Await, { promise: 42 })).textContent).toBe('42')
  })
})

describe('lazy', () => {
  test('shows pending, then the loaded component with its props', async () => {
    const Target = (p: { name: string }) => `hello ${p.name}`
    const Lazy = lazy(async () => ({ default: Target }), { pending: () => '…' })
    const el = render(() => createComponent(Lazy, { name: 'lux' }))
    expect(el.textContent).toBe('…')
    await tick()
    expect(el.textContent).toBe('hello lux')
    expect(await Lazy.preload()).toBe(Target)
  })

  test('a failed load goes to the boundary, and reset retries', async () => {
    let attempts = 0
    const Lazy = lazy(async () => {
      if (++attempts === 1) throw new Error('offline')
      return () => 'loaded'
    })
    const el = render(() => boundary(() => createComponent(Lazy, {})))
    await tick()
    expect(el.textContent).toBe('error: offline')
    el.querySelector('button')!.click()
    await tick()
    await tick()
    expect(el.textContent).toBe('loaded')
    expect(attempts).toBe(2)
  })
})

describe('Transition', () => {
  test('keeps a leaving element until its leave animation calls done', async () => {
    const show = state(true)
    const log: string[] = []
    let finishLeave!: () => void
    const el = render(() =>
      createComponent(Transition, {
        onEnter: (e: Element, done: () => void) => {
          log.push(`enter ${e.textContent}`)
          done()
        },
        onLeave: (e: Element, done: () => void) => {
          log.push(`leave ${e.textContent}`)
          finishLeave = done
        },
        children: () => () => (show.get() ? h('p', 'A') : h('p', 'B')),
      }),
    )
    expect(el.innerHTML).toBe('<p>A</p>')
    expect(log).toEqual([]) // no appear by default
    show.set(false)
    await tick()
    expect(log).toEqual(['leave A', 'enter B'])
    expect(el.innerHTML).toBe('<p>A</p><p>B</p>')
    finishLeave()
    await tick()
    expect(el.innerHTML).toBe('<p>B</p>')
  })

  test('CSS mode adds the enter classes, then removes them', async () => {
    const show = state(false)
    const el = render(() =>
      createComponent(Transition, { name: 'fade', children: () => () => show.get() && h('div', 'x') }),
    )
    show.set(true)
    flush()
    const div = el.querySelector('div')!
    expect(div.className).toBe('fade-enter-from fade-enter-active')
    await new Promise((r) => setTimeout(r, 80))
    expect(div.hasAttribute('class')).toBe(false)
  })
})

describe('URL safety', () => {
  test('dynamic javascript: URLs are blocked, other URLs pass', () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const a = document.createElement('a')
    const root = new Owner(null)
    const href = state('javascript:alert(1)')
    runWithOwner(root, () => attr(a, 'href', () => href.get()))
    expect(a.hasAttribute('href')).toBe(false)
    expect(error).toHaveBeenCalled()
    href.set(' \tJaVa\nScRiPt:alert(1)')
    flush()
    expect(a.hasAttribute('href')).toBe(false)
    href.set('/safe?x=javascript:1')
    flush()
    expect(a.getAttribute('href')).toBe('/safe?x=javascript:1')
    root.dispose()
    error.mockRestore()
  })
})

describe('dev warnings', () => {
  test('duplicate keys in a list warn once', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    render(() => mapKeyed(() => [1, 1, 2], (i) => i, () => 'x'))
    expect(warn.mock.calls.some((c) => String(c[0]).includes('duplicate key 1'))).toBe(true)
    warn.mockRestore()
  })
})

describe('server rendering', () => {
  test('renderToString renders text, regions and child components without running init', async () => {
    let inits = 0
    const Child = () => {
      init(() => void inits++)
      return 'c'
    }
    const n = state('b')
    const App = () => ['a', () => n.get(), createComponent(Child, {})]
    expect(await renderToString(App)).toBe('abc')
    await tick()
    expect(inits).toBe(0)
  })

  test('text is escaped', () => {
    const doc = parseHTML('<html><body></body></html>').document as unknown as Document
    expect(renderToStringWith(doc, () => 'x & <y>')).toBe('x &amp; &lt;y&gt;')
  })

  test('hydrate replaces server markup and becomes interactive', async () => {
    const target = document.createElement('div')
    target.innerHTML = '<p>server</p>'
    document.body.appendChild(target)
    const n = state(1)
    const app = hydrate(() => () => `client ${n.get()}`, target)
    apps.push(app)
    expect(target.innerHTML).toBe('client 1')
    n.set(2)
    await tick()
    expect(target.innerHTML).toBe('client 2')
  })
})

describe('dev tools', () => {
  test('inspect lists mounted component trees with props', () => {
    function Child(p: { label: string }) {
      return p.label
    }
    function Parent() {
      return createComponent(Child, { label: 'x' })
    }
    render(Parent)
    const tree = inspect()
    expect(tree.at(-1)).toEqual({ name: 'Parent', props: {}, children: [{ name: 'Child', props: { label: 'x' }, children: [] }] })
    expect(typeof (globalThis as any).__LUX_DEVTOOLS__.tree).toBe('function')
  })
})

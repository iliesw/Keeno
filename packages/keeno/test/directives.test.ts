// use: directives: when they run, cleanup, re-runs, lists and conditionals, SSR, errors.
import { afterEach, describe, expect, test } from 'bun:test'
import { createComponent, mount, type MountedApp } from '../src/component'
import { ErrorBoundary } from '../src/control'
import { and, getDocument, mapKeyed, use, type Directive } from '../src/dom'
import { renderToString } from '../src/server'
import { state } from '../src/state'

const tick = () => new Promise((r) => setTimeout(r, 0))

let apps: MountedApp[] = []
afterEach(() => {
  for (const a of apps) a.destroy()
  apps = []
  document.body.innerHTML = ''
})

function render(Comp: () => unknown) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const app = mount(Comp, target)
  apps.push(app)
  return { target, app }
}

/** A directive that logs what happens to it. */
function recorder(log: string[], name = 'd'): Directive<HTMLElement, unknown> {
  return (el, value) => {
    log.push(`${name} setup ${String(value)} connected=${el.isConnected}`)
    return () => log.push(`${name} cleanup ${String(value)}`)
  }
}

describe('use: directives', () => {
  test('run after the element is inserted, with the value; clean up on destroy', () => {
    const log: string[] = []
    const d = recorder(log)
    const { app } = render(() => {
      const el = document.createElement('button')
      use(el, () => d, () => 'hi')
      return el
    })
    expect(log).toEqual(['d setup hi connected=true'])
    app.destroy()
    apps = []
    expect(log).toEqual(['d setup hi connected=true', 'd cleanup hi'])
  })

  test('a value change runs the cleanup, then the directive again', async () => {
    const log: string[] = []
    const d = recorder(log)
    const n = state(1)
    render(() => {
      const el = document.createElement('div')
      use(el, () => d, () => n.get())
      return el
    })
    n.set(2)
    await tick()
    expect(log).toEqual(['d setup 1 connected=true', 'd cleanup 1', 'd setup 2 connected=true'])
  })

  test('reads inside the directive are not tracked', async () => {
    const n = state(1)
    let runs = 0
    const d: Directive = () => {
      runs++
      n.get()
    }
    render(() => {
      const el = document.createElement('div')
      use(el, () => d, () => undefined)
      return el
    })
    n.set(2)
    await tick()
    expect(runs).toBe(1)
  })

  test('a change of directive re-runs it', async () => {
    const log: string[] = []
    const which = state(recorder(log, 'a'))
    render(() => {
      const el = document.createElement('div')
      use(el, () => which.get(), () => 'x')
      return el
    })
    which.set(recorder(log, 'b'))
    await tick()
    expect(log).toEqual(['a setup x connected=true', 'a cleanup x', 'b setup x connected=true'])
  })

  test('several directives on one element run in order', () => {
    const log: string[] = []
    render(() => {
      const el = document.createElement('div')
      use(el, () => recorder(log, 'first'), () => 1)
      use(el, () => recorder(log, 'second'), () => 2)
      return el
    })
    expect(log).toEqual(['first setup 1 connected=true', 'second setup 2 connected=true'])
  })

  test('removing the element (conditional) runs the cleanup', async () => {
    const log: string[] = []
    const d = recorder(log)
    const show = state(true)
    render(() =>
      and(
        () => show.get(),
        () => {
          const el = document.createElement('p')
          use(el, () => d, () => 'p')
          return el
        },
      ),
    )
    expect(log).toEqual(['d setup p connected=true'])
    show.set(false)
    await tick()
    expect(log).toEqual(['d setup p connected=true', 'd cleanup p'])
    show.set(true)
    await tick()
    expect(log.at(-1)).toBe('d setup p connected=true')
  })

  test('keyed rows: each row runs its own directive and cleans up when removed', async () => {
    const log: string[] = []
    const d = recorder(log)
    const items = state([1, 2, 3])
    render(() =>
      mapKeyed(
        () => items.get(),
        (i) => i,
        (item) => {
          const li = document.createElement('li')
          use(li, () => d, () => item.get())
          return li
        },
      ),
    )
    expect(log).toEqual(['d setup 1 connected=true', 'd setup 2 connected=true', 'd setup 3 connected=true'])
    items.set([1, 3])
    await tick()
    expect(log.at(-1)).toBe('d cleanup 2')
  })

  test('a throwing directive goes to the closest ErrorBoundary', () => {
    const bad: Directive = () => {
      throw new Error('boom')
    }
    const { target } = render(() =>
      createComponent(ErrorBoundary, {
        fallback: (e: unknown) => `caught: ${(e as Error).message}`,
        children: () => {
          const el = document.createElement('div')
          use(el, () => bad, () => undefined)
          return el
        },
      }),
    )
    expect(target.textContent).toBe('caught: boom')
  })

  test('a value that is not a function is a clear error', () => {
    const { target } = render(() =>
      createComponent(ErrorBoundary, {
        fallback: (e: unknown) => (e as Error).message,
        children: () => {
          const el = document.createElement('div')
          use(el, () => 'nope', () => undefined, 'tooltip')
          return el
        },
      }),
    )
    expect(target.textContent).toBe('[keeno] use:tooltip needs a function, got string')
  })

  test('directives do not run on the server', async () => {
    let ran = false
    const d: Directive = () => {
      ran = true
    }
    const html = await renderToString(() => {
      const el = getDocument().createElement('div')
      use(el, () => d, () => undefined)
      return el
    })
    expect(html).toBe('<div></div>')
    expect(ran).toBe(false)
  })
})

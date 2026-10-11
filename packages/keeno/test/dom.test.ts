import { afterEach, describe, expect, test } from 'bun:test'
import { createComponent, mergeProps, mount } from '../src/component'
import { and, attr, bind, classValue, cond, insert, mapKeyed, on, or, spread, template } from '../src/dom'
import { destroy, init } from '../src/lifecycle'
import { Owner, flush, runWithOwner } from '../src/signal'
import { State, state } from '../src/state'

const tick = () => Promise.resolve()

let roots: Owner[] = []
afterEach(() => {
  for (const r of roots) r.dispose()
  roots = []
  document.body.innerHTML = ''
})

/** Run `fn` under a disposable root owner. */
function root<T>(fn: () => T): T {
  const r = new Owner(null)
  roots.push(r)
  return runWithOwner(r, fn)
}

function div() {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

/** Count child-list mutations under `el` while `fn` runs. */
async function mutations(el: Node, fn: () => void | Promise<void>) {
  const records: MutationRecord[] = []
  const mo = new MutationObserver((r) => records.push(...r))
  mo.observe(el, { childList: true, subtree: true, characterData: true, attributes: true })
  await fn()
  await tick()
  records.push(...mo.takeRecords())
  mo.disconnect()
  return records
}

describe('template', () => {
  test('clones a parsed HTML tree', () => {
    const t = template('<p class="a">hi <b>there</b></p>')
    const a = t() as HTMLElement
    const b = t() as HTMLElement
    expect(a).not.toBe(b)
    expect(a.outerHTML).toBe('<p class="a">hi <b>there</b></p>')
  })

  test('svg: parses SVG content in the SVG namespace and drops the wrapper', () => {
    const t = template('<g class="a"><circle r="2"></circle><a href="#"><text>x</text></a></g>', true)
    const g = t() as SVGElement
    expect(g.parentNode).toBeNull()
    expect(g.nodeName).toBe('g')
    for (const el of [g, ...g.querySelectorAll('*')]) expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(t()).not.toBe(g)
    // Without the flag, an SVG child is an unknown HTML element.
    expect((template('<circle></circle>')() as Element).namespaceURI).toBe('http://www.w3.org/1999/xhtml')
  })

  test('table parts as roots are kept (no implied wrappers)', () => {
    expect((template('<tr><td>a</td></tr>')() as Element).outerHTML).toBe('<tr><td>a</td></tr>')
    expect((template('<td>a</td>')() as Element).outerHTML).toBe('<td>a</td>')
  })
})

describe('insert', () => {
  test('renders strings, numbers, nodes, arrays, null and false', () => {
    const el = div()
    root(() => {
      insert(el, 'a')
      insert(el, 1)
      insert(el, null)
      insert(el, false)
      insert(el, [document.createElement('i'), 'b', [2, null]])
    })
    expect(el.innerHTML).toBe('a1<i></i>b2')
  })

  test('a function is tracked and re-rendered in place', async () => {
    const el = div()
    const n = state(1)
    root(() => insert(el, () => n.get()))
    const text = el.firstChild
    expect(el.textContent).toBe('1')
    n.set(2)
    await tick()
    expect(el.textContent).toBe('2')
    expect(el.firstChild).toBe(text) // text node updated, not replaced
  })

  test('respects the marker position', async () => {
    const el = div()
    el.innerHTML = '<b></b><!----><i></i>'
    const v = state<string | null>('x')
    root(() => insert(el, () => v.get(), el.childNodes[1]))
    expect(el.innerHTML).toBe('<b></b>x<!----><i></i>')
    v.set(null)
    await tick()
    expect(el.innerHTML).toBe('<b></b><!----><i></i>')
    v.set('y')
    await tick()
    expect(el.innerHTML).toBe('<b></b>y<!----><i></i>')
  })

  test('nested functions resolve (&& and ternaries with plain JS)', async () => {
    const el = div()
    const show = state(false)
    root(() => insert(el, () => show.get() && (() => 'shown')))
    expect(el.textContent).toBe('')
    show.set(true)
    await tick()
    expect(el.textContent).toBe('shown')
  })
})

describe('insert isolation', () => {
  test('functions in an array re-run independently', async () => {
    const el = div()
    const a = state(1)
    const b = state(1)
    let aRuns = 0
    let bRuns = 0
    root(() =>
      insert(el, [
        () => (aRuns++, a.get()),
        '-',
        () => (bRuns++, b.get()),
      ]),
    )
    expect(el.textContent).toBe('1-1')
    a.set(2)
    await tick()
    expect(el.textContent).toBe('2-1')
    expect([aRuns, bRuns]).toEqual([2, 1])
  })

  test('the outer accessor is not re-run when a nested value changes', async () => {
    const el = div()
    const n = state(0)
    let outer = 0
    root(() =>
      insert(el, () => {
        outer++
        return [document.createElement('b'), () => n.get()]
      }),
    )
    n.set(1)
    await tick()
    expect(outer).toBe(1)
    expect(el.innerHTML).toBe('<b></b>1')
  })

  test('a multi-root component is not re-created when its dynamic part changes', async () => {
    const target = div()
    const n = state(0)
    let setups = 0
    function App() {
      setups++
      return [document.createElement('h1'), () => n.get()]
    }
    mount(App, target)
    n.set(1)
    await tick()
    expect(setups).toBe(1)
    expect(target.innerHTML).toBe('<h1></h1>1')
  })
})

describe('conditionals', () => {
  test('and(): the branch is not re-created while the test stays truthy', async () => {
    const el = div()
    const n = state(6)
    let created = 0
    root(() =>
      insert(
        el,
        and(
          () => n.get() > 5,
          () => (created++, document.createElement('p')),
        ),
      ),
    )
    const p = el.firstChild
    expect(created).toBe(1)
    n.set(7)
    await tick()
    expect(created).toBe(1)
    expect(el.firstChild).toBe(p)
    n.set(1)
    await tick()
    expect(el.innerHTML).toBe('')
  })

  test('and(): a falsy number renders like JS (0)', () => {
    const el = div()
    root(() => insert(el, and(() => 0, () => 'x')))
    expect(el.textContent).toBe('0')
  })

  test('or() and cond()', async () => {
    const el = div()
    const a = state<string | null>(null)
    const b = state(true)
    root(() => {
      insert(el, or(() => a.get(), () => 'fallback'))
      insert(el, cond(() => b.get(), () => '|yes', () => '|no'))
    })
    expect(el.textContent).toBe('fallback|yes')
    a.set('value')
    b.set(false)
    await tick()
    expect(el.textContent).toBe('value|no')
  })

  test('components in a branch are destroyed when it hides', async () => {
    const el = div()
    const show = state(true)
    const log: string[] = []
    function Child() {
      init(() => void log.push('init'))
      destroy(() => log.push('destroy'))
      return document.createElement('span')
    }
    root(() => insert(el, and(() => show.get(), () => createComponent(Child, {}))))
    flush()
    show.set(false)
    await tick()
    show.set(true)
    await tick()
    expect(log).toEqual(['init', 'destroy', 'init'])
    expect(el.innerHTML).toBe('<span></span>')
  })
})

describe('mapKeyed', () => {
  type Todo = { id: number; text: string }
  const li = (item: State<Todo>) => {
    const el = document.createElement('li')
    root(() => insert(el, () => item.get().text))
    return el
  }

  function setup(initial: Todo[]) {
    const el = div()
    const list = state(initial)
    let renders = 0
    root(() =>
      insert(
        el,
        mapKeyed(
          () => list.get(),
          (t) => t.id,
          (t) => (renders++, li(t)),
        ),
      ),
    )
    return { el, list, renders: () => renders }
  }

  const texts = (el: Element) => [...el.children].map((c) => c.textContent)

  test('renders rows in order', () => {
    const { el } = setup([
      { id: 1, text: 'a' },
      { id: 2, text: 'b' },
    ])
    expect(texts(el)).toEqual(['a', 'b'])
  })

  test('adding a row inserts one node and reuses the others', async () => {
    const { el, list, renders } = setup([
      { id: 1, text: 'a' },
      { id: 2, text: 'b' },
    ])
    const [first, second] = el.children
    const records = await mutations(el, () => list.set([...list.peek(), { id: 3, text: 'c' }]))
    expect(texts(el)).toEqual(['a', 'b', 'c'])
    expect(el.children[0]).toBe(first)
    expect(el.children[1]).toBe(second)
    expect(renders()).toBe(3)
    expect(records.reduce((n, r) => n + r.addedNodes.length + r.removedNodes.length, 0)).toBe(1)
  })

  test('removing a row removes only its node', async () => {
    const { el, list } = setup([
      { id: 1, text: 'a' },
      { id: 2, text: 'b' },
      { id: 3, text: 'c' },
    ])
    const records = await mutations(el, () => list.set(list.peek().filter((t) => t.id !== 2)))
    expect(texts(el)).toEqual(['a', 'c'])
    expect(records.length).toBe(1)
    expect(records[0].removedNodes.length).toBe(1)
  })

  test('reorders by moving nodes, without re-rendering', async () => {
    const { el, list, renders } = setup([
      { id: 1, text: 'a' },
      { id: 2, text: 'b' },
      { id: 3, text: 'c' },
    ])
    const nodes = [...el.children]
    list.set([list.peek()[2], list.peek()[0], list.peek()[1]])
    await tick()
    expect(texts(el)).toEqual(['c', 'a', 'b'])
    expect([...el.children]).toEqual([nodes[2], nodes[0], nodes[1]])
    expect(renders()).toBe(3)
  })

  test('a new item object with the same key updates the row in place', async () => {
    const { el, list, renders } = setup([{ id: 1, text: 'a' }])
    const node = el.firstChild
    list.set([{ id: 1, text: 'A' }])
    await tick()
    expect(texts(el)).toEqual(['A'])
    expect(el.firstChild).toBe(node)
    expect(renders()).toBe(1)
  })

  test('index is a state that follows moves', async () => {
    const el = div()
    const list = state(['a', 'b'])
    root(() =>
      insert(
        el,
        mapKeyed(
          () => list.get(),
          (x) => x,
          (x, i) => {
            const span = document.createElement('span')
            insert(span, () => `${i.get()}${x.get()}`)
            return span
          },
        ),
      ),
    )
    expect(el.textContent).toBe('0a1b')
    list.set(['b', 'a'])
    await tick()
    expect(el.textContent).toBe('0b1a')
  })

  test('removed rows are destroyed', async () => {
    const el = div()
    const list = state([1, 2])
    const log: string[] = []
    function Row(p: { n: number }) {
      destroy(() => log.push(`destroy ${p.n}`))
      return document.createElement('i')
    }
    root(() =>
      insert(
        el,
        mapKeyed(
          () => list.get(),
          (n) => n,
          (n) => createComponent(Row, { n: n.peek() }),
        ),
      ),
    )
    list.set([2])
    await tick()
    expect(log).toEqual(['destroy 1'])
    expect(el.children.length).toBe(1)
  })

  test('rows whose output is dynamic (functions) still work', async () => {
    const el = div()
    const list = state([1, 2])
    const flag = state(false)
    root(() =>
      insert(
        el,
        mapKeyed(
          () => list.get(),
          (n) => n,
          (n) => () => (flag.get() ? `[${n.get()}]` : `${n.get()}`),
        ),
      ),
    )
    expect(el.textContent).toBe('12')
    flag.set(true)
    await tick()
    expect(el.textContent).toBe('[1][2]')
    list.set([2, 1])
    await tick()
    expect(el.textContent).toBe('[2][1]')
  })
})

describe('attr / on / bind', () => {
  test('attr sets, updates and removes attributes', async () => {
    const el = document.createElement('a')
    const href = state<string | null>('/a')
    root(() => attr(el, 'href', () => href.get()))
    expect(el.getAttribute('href')).toBe('/a')
    href.set(null)
    await tick()
    expect(el.hasAttribute('href')).toBe(false)
  })

  test('attr skips writes when the value is unchanged', async () => {
    const el = document.createElement('a')
    const v = state({ label: 'x' })
    root(() => attr(el, 'aria-label', () => v.get().label))
    const records = await mutations(el, () => v.set({ label: 'x' }))
    expect(records).toHaveLength(0)
  })

  test('attr booleans', () => {
    const el = document.createElement('button')
    attr(el, 'disabled', true)
    expect(el.getAttribute('disabled')).toBe('')
    attr(el, 'disabled', false)
    expect(el.hasAttribute('disabled')).toBe(false)
  })

  test('class keeps the scope class', async () => {
    const el = document.createElement('p')
    const cls = state<string | null>('warn')
    root(() => attr(el, 'class', () => cls.get(), 'keeno-abc'))
    expect(el.className).toBe('warn keeno-abc')
    cls.set(null)
    await tick()
    expect(el.className).toBe('keeno-abc')
  })

  test('value and checked are set as properties', () => {
    const input = document.createElement('input')
    attr(input, 'value', 'x')
    expect(input.value).toBe('x')
    const box = document.createElement('input')
    box.type = 'checkbox'
    attr(box, 'checked', true)
    expect(box.checked).toBe(true)
  })

  test('on adds an event listener', () => {
    const el = document.createElement('button')
    let clicks = 0
    on(el, 'click', () => clicks++)
    el.click()
    expect(clicks).toBe(1)
  })

  test('bind:value works in both directions', async () => {
    const input = document.createElement('input')
    const name = state('a')
    root(() => bind(input, 'value', name))
    expect(input.value).toBe('a')
    name.set('b')
    await tick()
    expect(input.value).toBe('b')
    input.value = 'typed'
    input.dispatchEvent(new Event('input'))
    expect(name.peek()).toBe('typed')
  })

  test('bind:value on a number input stores numbers', () => {
    const input = document.createElement('input')
    input.type = 'number'
    const n = state<number | null>(1)
    root(() => bind(input, 'value', n))
    input.value = '42'
    input.dispatchEvent(new Event('input'))
    expect(n.peek()).toBe(42)
  })

  test('bind:checked works in both directions', async () => {
    const box = document.createElement('input')
    box.type = 'checkbox'
    const done = state(false)
    root(() => bind(box, 'checked', done))
    done.set(true)
    await tick()
    expect(box.checked).toBe(true)
    box.checked = false
    box.dispatchEvent(new Event('change'))
    expect(done.peek()).toBe(false)
  })

  test('bind rejects non-states', () => {
    expect(() => bind(document.createElement('input'), 'value', 'x' as any)).toThrow(/state/)
  })
})

describe('class arrays and objects', () => {
  test('classValue', () => {
    expect(classValue(['btn', false && 'x', null, 'on'])).toBe('btn on')
    expect(classValue({ a: true, b: false, c: 1 })).toBe('a c')
    expect(classValue(['x', ['y', { z: true }]])).toBe('x y z')
    expect(classValue(undefined)).toBe('')
  })

  test('attr class accepts arrays and keeps the scope class', async () => {
    const el = document.createElement('button')
    const active = state(false)
    root(() => attr(el, 'class', () => ['btn', active.get() && 'on'], 'keeno-s'))
    expect(el.className).toBe('btn keeno-s')
    active.set(true)
    await tick()
    expect(el.className).toBe('btn on keeno-s')
  })
})

describe('spread', () => {
  test('applies attributes, class and events; tracks changes; clears removed keys', async () => {
    const el = document.createElement('input')
    const attrs = state<Record<string, unknown>>({ type: 'text', placeholder: 'a', class: ['x'], onInput: () => log.push('input') })
    const log: string[] = []
    root(() => spread(el, mergeProps(() => attrs.get()), 'keeno-s'))
    expect(el.getAttribute('type')).toBe('text')
    expect(el.getAttribute('placeholder')).toBe('a')
    expect(el.className).toBe('x keeno-s')
    el.dispatchEvent(new Event('input'))
    expect(log).toEqual(['input'])
    attrs.set({ type: 'text', class: 'y', onInput: () => log.push('new handler') })
    await tick()
    expect(el.hasAttribute('placeholder')).toBe(false)
    expect(el.className).toBe('y keeno-s')
    el.dispatchEvent(new Event('input'))
    expect(log).toEqual(['input', 'new handler'])
  })

  test('works with mergeProps sources whose keys change', async () => {
    const el = document.createElement('a')
    const extra = state<Record<string, string>>({ href: '/a' })
    root(() => spread(el, mergeProps(() => extra.get(), { title: 't' })))
    expect(el.getAttribute('href')).toBe('/a')
    expect(el.getAttribute('title')).toBe('t')
    extra.set({ target: '_blank' })
    await tick()
    expect(el.hasAttribute('href')).toBe(false)
    expect(el.getAttribute('target')).toBe('_blank')
  })
})

describe('bind with state options', () => {
  test('a coerced write is shown in the input', () => {
    const input = document.createElement('input')
    input.type = 'number'
    const n = state(5, { validate: (v: number | null) => Math.min(Number(v), 10) })
    root(() => bind(input, 'value', n as any))
    input.value = '42'
    input.dispatchEvent(new Event('input'))
    expect(n.peek()).toBe(10)
    expect(input.value).toBe('10')
  })

  test('typing is not overwritten while a debounced write is pending', () => {
    const input = document.createElement('input')
    const q = state('', { debounce: 50 })
    root(() => bind(input, 'value', q))
    input.value = 'abc'
    input.dispatchEvent(new Event('input'))
    expect(input.value).toBe('abc')
    expect(q.peek()).toBe('')
  })

  test('number inputs keep what the user typed (1.0 stays 1.0)', () => {
    const input = document.createElement('input')
    input.type = 'number'
    const n = state<number | null>(1)
    root(() => bind(input, 'value', n))
    input.value = '1.0'
    input.dispatchEvent(new Event('input'))
    expect(input.value).toBe('1.0')
  })
})

describe('mount / mergeProps', () => {
  test('mount renders, runs init after insertion, and destroy removes nodes', () => {
    const target = div()
    const log: string[] = []
    function App() {
      const p = document.createElement('p')
      init(() => void log.push(`init connected=${p.isConnected}`))
      destroy(() => log.push('destroy'))
      return p
    }
    const app = mount(App, target)
    expect(target.innerHTML).toBe('<p></p>')
    expect(log).toEqual(['init connected=true'])
    app.destroy()
    expect(target.innerHTML).toBe('')
    expect(log).toEqual(['init connected=true', 'destroy'])
  })

  test('mergeProps resolves keys lazily, later sources win', () => {
    const a = state(1)
    const p = mergeProps(
      {
        get x() {
          return a.get()
        },
        y: 1,
      },
      { y: 2 },
    )
    expect(p.x).toBe(1)
    a.set(5)
    expect(p.x).toBe(5)
    expect(p.y).toBe(2)
    expect(Object.keys(p).sort()).toEqual(['x', 'y'])
    expect({ ...p }).toEqual({ x: 5, y: 2 })
  })
})

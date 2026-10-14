// <Virtual>: renders the rows in view, reuses them on scroll, follows list changes.
import { afterEach, describe, expect, test } from 'bun:test'
import { createComponent, mount, type MountedApp } from '../src/component'
import { renderToString } from '../src/server'
import { flush } from '../src/signal'
import { state } from '../src/state'
import { store } from '../src/store'
import { Virtual, type VirtualHandle } from '../src/virtual'

let apps: MountedApp[] = []
afterEach(() => {
  for (const a of apps) a.destroy()
  apps = []
  document.body.innerHTML = ''
})

const frame = () => new Promise((r) => setTimeout(r, 30))
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

function setup(each: () => unknown[], extra: Record<string, unknown> = {}) {
  let created = 0
  let handle: VirtualHandle | null = null
  const target = document.createElement('div')
  document.body.appendChild(target)
  const app = mount(
    () =>
      createComponent(Virtual, {
        get each() {
          return each()
        },
        itemHeight: 10,
        overscan: 0,
        initialHeight: 50,
        ref: (h: VirtualHandle | null) => (handle = h),
        children: () => (item: unknown) => {
          created++
          return `row ${item}`
        },
        ...extra,
      }),
    target,
  )
  apps.push(app)
  const el = target.firstElementChild as HTMLElement
  const texts = () => Array.from(el.firstElementChild!.firstElementChild!.children).map((r) => r.textContent)
  const scroll = async (top: number) => {
    el.scrollTop = top
    el.dispatchEvent(new Event('scroll'))
    await frame()
    flush()
  }
  return { el, texts, scroll, created: () => created, handle: () => handle! }
}

describe('<Virtual>', () => {
  test('renders only the rows in view, inside a spacer of the full height', () => {
    const v = setup(() => range(1000))
    expect(v.texts()).toEqual(['row 0', 'row 1', 'row 2', 'row 3', 'row 4', 'row 5'])
    expect((v.el.firstElementChild as HTMLElement).style.height).toBe('10000px')
  })

  test('scrolling moves the window and keeps rows that stay in view', async () => {
    const v = setup(() => range(1000))
    const before = v.created()
    await v.scroll(30)
    expect(v.texts()).toEqual(['row 3', 'row 4', 'row 5', 'row 6', 'row 7', 'row 8'])
    // rows 3-5 were reused: only 6, 7 and 8 are new.
    expect(v.created() - before).toBe(3)
    const win = v.el.firstElementChild!.firstElementChild as HTMLElement
    expect(win.style.transform).toBe('translateY(30px)')
  })

  test('follows changes to the list, keyed by item', () => {
    const list = state(['a', 'b', 'c'])
    const v = setup(() => list.get())
    const first = v.el.querySelector('[data-keeno-virtual] div div div')
    list.set(['z', 'a', 'b', 'c'])
    flush()
    expect(v.texts()).toEqual(['row z', 'row a', 'row b', 'row c'])
    list.set(['a'])
    flush()
    expect(v.texts()).toEqual(['row a'])
    expect(first).toBeTruthy()
  })

  test('tracks a store array mutated in place', () => {
    const s = store({ items: ['a'] })
    const v = setup(() => s.items)
    s.items.push('b')
    flush()
    expect(v.texts()).toEqual(['row a', 'row b'])
  })

  test('variable heights from a function', () => {
    const v = setup(() => range(10), { itemHeight: (_: number, i: number) => (i % 2 ? 20 : 10) })
    expect((v.el.firstElementChild as HTMLElement).style.height).toBe('150px')
    expect(v.texts()).toEqual(['row 0', 'row 1', 'row 2', 'row 3'])
  })

  test('ref gets scrollTo(index)', async () => {
    const v = setup(() => range(1000))
    v.handle().scrollTo(500)
    flush()
    expect(v.texts()[0]).toBe('row 500')
  })

  test('server renders the first screen of rows', async () => {
    const html = await renderToString(() =>
      createComponent(Virtual, { each: range(100), itemHeight: 20, overscan: 0, initialHeight: 60, children: () => (i: number) => `r${i}` }),
    )
    expect(html).toContain('r0')
    expect(html).toContain('r3')
    expect(html).not.toContain('r4<')
    expect(html).toContain('height:2000px')
  })
})

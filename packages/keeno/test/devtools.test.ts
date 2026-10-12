// The dev tools backend (`__KEENO_DEVTOOLS__`): component tree, states, updates, writes, picking.
import { afterEach, describe, expect, test } from 'bun:test'
import { createComponent, mount, type MountedApp } from '../src/component'
import { template } from '../src/dom'
import { insert } from '../src/dom'
import { derived, flush, label } from '../src/signal'
import { state } from '../src/state'

const tick = () => new Promise((r) => setTimeout(r, 0))
const devtools = () => (globalThis as any).__KEENO_DEVTOOLS__

let apps: MountedApp[] = []
afterEach(() => {
  for (const a of apps) a.destroy()
  apps = []
  document.body.innerHTML = ''
})

function render(Comp: (p: any) => unknown) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  apps.push(mount(Comp, target))
  return target
}

const button = template('<button></button>')

function Counter(p: { step: number }) {
  const count = label(state(0), 'count')
  const double = label(
    derived(() => count.get() * 2),
    'double',
  )
  const el = button() as HTMLButtonElement
  insert(el, () => `${count.get()} / ${double.get()}`)
  el.onclick = () => count.set(count.peek() + p.step)
  return el
}
;(Counter as any).__keenoFile = 'src/Counter.kn'

function Page() {
  return [createComponent(Counter, { step: 1 }), createComponent(Counter, { step: 5 })]
}

const find = (name: string) => {
  const out: any[] = []
  const walk = (list: any[]) => {
    for (const c of list) {
      if (c.name === name) out.push(c)
      walk(c.children)
    }
  }
  walk(devtools().components())
  return out
}

describe('dev tools backend', () => {
  test('lists components with their files, props and named states', () => {
    render(Page)
    const [a, b] = find('Counter')
    expect(a.file).toBe('src/Counter.kn')
    const d = devtools().details(b.id)
    expect(d.props).toEqual({ step: 5 })
    expect(d.states.map((s: any) => [s.name, s.kind, s.value])).toEqual([
      ['count', 'state', 0],
      ['double', 'derived', 0],
    ])
    expect(devtools().path(a.id)).toEqual([find('Page')[0].id, a.id])
  })

  test('sets states, counts updates and logs writes', async () => {
    const target = render(Page)
    const [a] = find('Counter')
    const count = devtools().details(a.id).states[0]
    devtools().clearLog()
    expect(devtools().set(count.id, 3)).toBe(true)
    await tick()
    expect(target.querySelector('button')!.textContent).toBe('3 / 6')
    expect(find('Counter')[0].updates).toBe(1)
    const [write] = devtools().log()
    expect(write).toMatchObject({ type: 'write', name: 'count', componentName: 'Counter', old: 0, next: 3, source: 'local' })
    // Deriveds are read-only.
    expect(devtools().set(devtools().details(a.id).states[1].id, 1)).toBe(false)
  })

  test('reports re-rendered components after each flush', async () => {
    const target = render(Page)
    const seen: number[][] = []
    const off = devtools().subscribe((m: any) => m.type === 'flush' && seen.push(m.rendered))
    target.querySelectorAll('button')[1]!.dispatchEvent(new Event('click'))
    flush()
    off()
    expect(seen).toEqual([[find('Counter')[1].id]])
  })

  test('finds the component that owns a DOM node', () => {
    const target = render(Page)
    const second = target.querySelectorAll('button')[1]!
    const id = devtools().at(second.firstChild!)
    expect(id).toBe(find('Counter')[1].id)
    expect(devtools().nodes(id)).toEqual([second])
  })

  test('lists stores created outside components', () => {
    const theme = label(state('dark'), 'theme')
    expect(devtools().stores().some((s: any) => s.name === 'theme' && s.value === 'dark')).toBe(true)
    theme.set('light')
  })
})

describe('dev tools panel', () => {
  const panel = async () => {
    // happy-dom reports navigator.webdriver, which keeps the panel out of automated browsers.
    ;(globalThis as any).__KEENO_DEVTOOLS_FORCE__ = true
    await import('../src/devtools-ui')
    await tick()
    return document.querySelector('keeno-devtools')!.shadowRoot!
  }
  const frame = () => new Promise((r) => setTimeout(r, 120))

  test('is generated from the .kn sources', async () => {
    const { stale } = await import('../../../scripts/build-devtools')
    expect(stale()).toEqual([])
  })

  test('shows the tree, inspects a component and edits its state', async () => {
    localStorage.setItem('keeno-devtools', JSON.stringify({ open: true, tab: 'components' }))
    const target = render(Page)
    const root = await panel()
    await frame()
    const rows = () => [...root.querySelectorAll('.row:not(.stores)')]
    expect(rows().map((r) => r.textContent)).toEqual(['▾<Page>', '<Counter>', '<Counter>'])

    ;(rows()[2] as HTMLElement).click()
    await tick()
    expect(root.querySelector('.inspector')!.textContent).toContain('src/Counter.kn')
    expect([...root.querySelectorAll('.kv.state .key')].map((k) => k.textContent)).toEqual(['count', 'double'])

    // Click the number to edit it, type, press Enter: the app updates.
    ;(root.querySelector('.kv.state .editable') as HTMLElement).click()
    await tick()
    const input = root.querySelector('input.inline') as HTMLInputElement
    input.value = '7'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await tick()
    expect(target.querySelectorAll('button')[1]!.textContent).toBe('7 / 14')
    await frame()
    expect(root.querySelector('.kv.state .editable')!.textContent).toBe('7')
    localStorage.removeItem('keeno-devtools')
  })

  test('is invisible to the dev tools', async () => {
    render(Page)
    const root = await panel()
    // The panel is not in the component tree, and its own updates are not reported.
    expect(devtools().components().map((c: any) => c.name)).not.toContain('Panel')
    const messages: string[] = []
    const off = devtools().subscribe((m: any) => messages.push(m.type))
    // Close, open and switch tabs: plenty of panel state changes and re-renders.
    ;(root.querySelector('button[title^="Close"]') as HTMLElement).click()
    await frame()
    // The panel animates out before it is removed.
    expect(root.querySelector('.panel.closing')).not.toBeNull()
    await new Promise((r) => setTimeout(r, 250))
    ;(root.querySelector('.fab') as HTMLElement).click()
    await frame()
    ;(root.querySelectorAll('.tab')[2] as HTMLElement).click()
    await frame()
    expect(root.querySelector('.cards')).not.toBeNull()
    await frame()
    off()
    expect(messages).toEqual([])
  })
})

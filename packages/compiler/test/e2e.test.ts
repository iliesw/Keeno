// Compile real .kn fixtures, load them through a Bun plugin and mount them in happy-dom.
import { plugin } from 'bun'
import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { flush, mount, state, type MountedApp } from '@inflector/keeno'
import { compile } from '../src/index'

beforeAll(() => {
  plugin({
    name: 'keeno-test',
    setup(build) {
      build.onLoad({ filter: /\.kn$/ }, async ({ path }) => ({
        contents: compile(await Bun.file(path).text(), { filename: path }).js,
        loader: 'ts',
      }))
    },
  })
})

const tick = () => new Promise((r) => setTimeout(r, 0))
let app: MountedApp | undefined
afterEach(() => {
  app?.destroy()
  app = undefined
  document.body.innerHTML = ''
})

async function render(fixture: string, props: Record<string, any> = {}) {
  const Comp = (await import(`./fixtures/${fixture}.kn`)).default
  const target = document.createElement('div')
  document.body.appendChild(target)
  app = mount(Comp, target, props)
  return target
}

const $ = (root: Element, sel: string) => root.querySelector(sel) as HTMLElement
function type(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('Counter', () => {
  test('renders props and state, reacts to clicks', async () => {
    const log: string[] = []
    const saved: number[] = []
    const el = await render('Counter', { title: 'Count', onSave: (n: number) => saved.push(n), log: (s: string) => log.push(s) })
    expect($(el, 'h1').textContent).toBe('Count: 0')
    $(el, '.inc').click()
    await tick()
    expect($(el, 'h1').textContent).toBe('Count: 1')
    $(el, '.save').click()
    expect(saved).toEqual([1])
  })

  test('lifecycle: init, auto update, deps update, onUpdate, destroy', async () => {
    const log: string[] = []
    const el = await render('Counter', { title: 't', onSave() {}, log: (s: string) => log.push(s) })
    expect(log).toEqual(['init']) // update() does not run on mount
    $(el, '.inc').click()
    expect(log).toEqual(['init', 'onUpdate 0->1']) // synchronous
    await tick()
    expect(log).toEqual(['init', 'onUpdate 0->1', 'auto 1', 'deps  1'])
    log.length = 0
    app!.destroy()
    app = undefined
    expect(log).toEqual(['destroy'])
  })

  test('bind:value works in both directions', async () => {
    const el = await render('Counter', { title: 't', onSave() {}, log() {} })
    const input = $(el, 'input') as HTMLInputElement
    type(input, 'Ada')
    await tick()
    expect($(el, '.name').textContent).toBe('Ada')
  })

  test('conditional renders when the condition flips', async () => {
    const el = await render('Counter', { title: 't', onSave() {}, log() {} })
    expect($(el, '.warn')).toBeNull()
    for (let i = 0; i < 3; i++) $(el, '.inc').click()
    await tick()
    const warn = $(el, '.warn')
    expect(warn.textContent).toBe('big!')
    $(el, '.inc').click()
    await tick()
    expect($(el, '.warn')).toBe(warn) // not re-created while still true
  })

  test('props stay reactive', async () => {
    const { state } = await import('@inflector/keeno')
    const title = state('A')
    const el = await render('Counter', {
      get title() {
        return title.get()
      },
      onSave() {},
      log() {},
    })
    title.set('B')
    await tick()
    expect($(el, 'h1').textContent).toBe('B: 0')
  })
})

describe('Todos', () => {
  async function setup() {
    const log: string[] = []
    const el = await render('Todos', { log: (s: string) => log.push(s) })
    const add = (text: string) => {
      type($(el, '.draft') as HTMLInputElement, text)
      $(el, '.add').click()
    }
    const items = () => [...el.querySelectorAll('li')]
    return { el, log, add, items }
  }

  test('adding todos renders rows and clears the input', async () => {
    const { el, add, items } = await setup()
    add('a')
    add('b')
    await tick()
    expect(items().map((li) => li.querySelector('span')!.textContent)).toEqual(['a', 'b'])
    expect(($(el, '.draft') as HTMLInputElement).value).toBe('')
    expect($(el, '.left').textContent).toBe('2 left')
  })

  test('only the affected <li> changes when adding, toggling and removing', async () => {
    const { el, add, items, log } = await setup()
    add('a')
    add('b')
    add('c')
    await tick()
    const [a, b, c] = items()
    const ul = $(el, 'ul')
    const records: MutationRecord[] = []
    const mo = new MutationObserver((r) => records.push(...r))
    mo.observe(ul, { childList: true, subtree: true, attributes: true, characterData: true })

    // toggle b: same <li> nodes, only b's class changes
    b.querySelector('input')!.dispatchEvent(new Event('change'))
    await tick()
    records.push(...mo.takeRecords())
    expect(items()).toEqual([a, b, c])
    expect(b.className).toBe('done')
    expect(records.every((r) => r.target === b || b.contains(r.target))).toBe(true)
    expect(records.filter((r) => r.type === 'childList')).toHaveLength(0)
    records.length = 0

    // remove a: one removal from the <ul>
    log.length = 0
    a.querySelector('button')!.click()
    await tick()
    records.push(...mo.takeRecords())
    expect(items()).toEqual([b, c])
    expect(records).toHaveLength(1)
    expect(records[0].removedNodes[0]).toBe(a)
    expect(log).toEqual(['destroy 1'])
    records.length = 0

    // add d: one insertion
    add('d')
    await tick()
    records.push(...mo.takeRecords())
    mo.disconnect()
    expect(items().slice(0, 2)).toEqual([b, c])
    const childList = records.filter((r) => r.target === ul)
    expect(childList).toHaveLength(1)
    expect(childList[0].addedNodes).toHaveLength(1)
    expect(log).toEqual(['destroy 1', 'init 4'])
  })
})

describe('derived, history, class arrays, spread', () => {
  test('derived updates with its inputs', async () => {
    const el = await render('Features')
    expect($(el, '.total').textContent).toBe('10')
    $(el, '.more').click()
    await tick()
    expect($(el, '.total').textContent).toBe('15')
  })

  test('undo / redo with reactive canUndo / canRedo', async () => {
    const el = await render('Features')
    const input = $(el, '.text') as HTMLInputElement
    const undo = $(el, '.undo') as HTMLButtonElement
    const redo = $(el, '.redo') as HTMLButtonElement
    expect(undo.disabled).toBe(true)
    type(input, 'ab')
    type(input, 'abc')
    await tick()
    expect(undo.disabled).toBe(false)
    undo.click()
    await tick()
    expect(input.value).toBe('ab')
    expect(redo.disabled).toBe(false)
    redo.click()
    await tick()
    expect(input.value).toBe('abc')
  })

  test('class arrays toggle', async () => {
    const el = await render('Features')
    const span = el.querySelector('span')!
    expect(span.className).toBe('flag')
    span.click()
    await tick()
    expect(span.className).toBe('flag on')
  })

  test('spread attributes apply, update and are overridden by later attributes', async () => {
    const el = await render('Features')
    const input = $(el, '.spread') as HTMLInputElement
    expect(input.getAttribute('placeholder')).toBe('type here')
    expect(input.getAttribute('data-kind')).toBe('demo')
    expect(input.getAttribute('title')).toBe('t')
    expect(input.className).toBe('spread')
    $(el, '.swap').click()
    await tick()
    expect(input.getAttribute('placeholder')).toBe('changed')
    expect(input.hasAttribute('data-kind')).toBe(false)
  })
})

describe('children and ternaries', () => {
  test('children render inside the child and stay reactive', async () => {
    const el = await render('WithCard')
    expect($(el, 'h2').textContent).toBe('n=1')
    expect($(el, 'section .n').textContent).toBe('1')
    $(el, '.inc').click()
    await tick()
    expect($(el, 'h2').textContent).toBe('n=2')
    expect($(el, 'section .n').textContent).toBe('2')
  })

  test('ternary switches branches', async () => {
    const el = await render('WithCard')
    expect($(el, '.yes')).not.toBeNull()
    $(el, '.toggle').click()
    await tick()
    expect($(el, '.yes')).toBeNull()
    expect($(el, '.no')).not.toBeNull()
  })
})

describe('Shell (built-in components from .kn)', () => {
  test('ErrorBoundary, Await, Transition and Portal', async () => {
    let resolve!: (v: string) => void
    const el = await render('Shell', { load: () => new Promise<string>((r) => (resolve = r)) })
    expect($(el, '.bomb').textContent).toBe('calm')
    expect($(el, 'i').textContent).toBe('loading')
    expect(document.querySelector('body > aside.toast')?.textContent).toBe('toast')

    resolve('done')
    await tick()
    expect($(el, 'b').textContent).toBe('done')

    $(el, '.toggle').click()
    flush()
    expect($(el, '.panel').className).toContain('fade-enter-active')

    $(el, '.boom').click()
    await tick()
    expect(el.querySelector('.bomb')).toBeNull()
    expect($(el, '.err').textContent).toBe('Error: kaboom')

    app!.destroy()
    app = undefined
    expect(document.querySelector('aside.toast')).toBeNull()
  })
})

describe('Refs', () => {
  test('ref() points at the element, is reactive, and clears when the element goes away', async () => {
    const log: string[] = []
    const el = await render('Refs', { log: (s: string) => log.push(s) })
    expect(log).toEqual(['init INPUT'])
    expect(document.activeElement).toBe($(el, '.field'))
    $(el, '.toggle').click()
    await tick()
    expect(log).toEqual(['init INPUT', 'current null'])
    $(el, '.toggle').click()
    await tick()
    expect(log.at(-1)).toBe('current set')
  })
})

describe('Context', () => {
  test('provided states and expressions stay reactive, and injected states are writable', async () => {
    const color = state('red')
    const el = await render('ThemeApp', {
      get color() {
        return color.get()
      },
    })
    expect($(el, '.leaf').textContent).toBe('light Ada red')
    $(el, '.rename').click()
    color.set('blue')
    await tick()
    expect($(el, '.leaf').textContent).toBe('light Grace blue')
    $(el, '.dark').click()
    await tick()
    expect($(el, '.current').textContent).toBe('dark')
    expect($(el, '.leaf').textContent).toBe('dark Grace blue')
  })
})

describe('StoreTodos (store, async derived, Loading)', () => {
  test('store mutations, bind on store paths, and async data', async () => {
    const pendingLoads: { owner: string; resolve: (v: any) => void }[] = []
    const load = (owner: string) => new Promise((resolve) => pendingLoads.push({ owner, resolve }))
    const el = await render('StoreTodos', { load })
    expect($(el, '.fallback').textContent).toBe('loading…')
    pendingLoads[0]!.resolve([{ id: 1, title: 'from ada', done: false }])
    await tick()
    expect($(el, '.remote').textContent).toBe('from ada')

    type($(el, '.draft') as HTMLInputElement, 'milk')
    $(el, '.add').click()
    type($(el, '.draft') as HTMLInputElement, 'eggs')
    $(el, '.add').click()
    await tick()
    expect((($(el, '.draft') as HTMLInputElement).value)).toBe('')
    expect([...el.querySelectorAll('.items span')].map((s) => s.textContent)).toEqual(['milk', 'eggs'])
    expect($(el, '.left').textContent).toBe('2 left')
    const box = el.querySelector('.items input') as HTMLInputElement
    box.checked = true
    box.dispatchEvent(new Event('change'))
    await tick()
    expect($(el, '.left').textContent).toBe('1 left')

    $(el, '.owner').click()
    await tick()
    expect(pendingLoads[1]!.owner).toBe('grace')
    expect($(el, '.remote').textContent).toBe('from ada') // stale while revalidating
    expect($(el, '.refreshing')).not.toBeNull()
    pendingLoads[1]!.resolve([{ id: 2, title: 'from grace', done: false }])
    await tick()
    expect($(el, '.remote').textContent).toBe('from grace')
    expect($(el, '.refreshing')).toBeNull()
  })
})

describe('Directives (use:)', () => {
  test('imported and local directives: setup after insert, re-run on change, cleanup on removal', async () => {
    const { log } = await import('./fixtures/directives')
    log.length = 0
    const el = await render('Directives')
    expect($(el, '.menu').getAttribute('data-label')).toBe('item 1')
    $(el, '.inc').click()
    await tick()
    expect($(el, '.menu').getAttribute('data-label')).toBe('item 2')
    expect(log).toEqual(['label item 1', 'unlabel item 1', 'label item 2'])

    $(el, '.outside').click()
    await tick()
    expect(el.querySelector('.menu')).toBeNull()
    expect(log.at(-1)).toBe('unlabel item 2')

    // Removed: its clickOutside listener is gone too.
    $(el, '.toggle').click()
    await tick()
    expect($(el, '.menu')).not.toBeNull()
    $(el, '.menu').click()
    await tick()
    expect($(el, '.menu')).not.toBeNull()
  })
})

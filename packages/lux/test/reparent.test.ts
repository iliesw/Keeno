// reparentable(): moving live content around the tree, and native moveBefore in the reconciler.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createComponent, mount, type MountedApp } from '../src/component'
import { insert, mapKeyed, moveNode } from '../src/dom'
import { destroy, init } from '../src/lifecycle'
import { keyedReparentable, reparentable, type Reparentable } from '../src/reparent'
import { flush } from '../src/signal'
import { state, type State } from '../src/state'

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

/** A component with its own state and lifecycle counters. */
function counterComponent(log: string[]) {
  return function Counter() {
    const n = state(0)
    init(() => void log.push('init'))
    destroy(() => log.push('destroy'))
    const el = document.createElement('button')
    el.addEventListener('click', () => n.set(n.peek() + 1))
    insert(el, () => n.get())
    return el
  }
}

/** Patch a native-like `moveBefore` onto elements, recording the nodes it moved. */
function withMoveBefore() {
  const moved: Node[] = []
  const proto = Element.prototype as any
  const had = 'moveBefore' in proto
  beforeEach(() => {
    moved.length = 0
    proto.moveBefore = function (node: Node, ref: Node | null) {
      if (!node.isConnected || !this.isConnected) throw new DOMException('not connected', 'HierarchyRequestError')
      moved.push(node)
      this.insertBefore(node, ref)
    }
  })
  afterEach(() => {
    if (!had) delete proto.moveBefore
  })
  return moved
}

describe('reparentable', () => {
  test('moves between places without re-creating the content', () => {
    const log: string[] = []
    const left = state(true)
    let player!: Reparentable
    const root = render(() => {
      player = reparentable(() => createComponent(counterComponent(log), {}))
      const a = document.createElement('section')
      const b = document.createElement('aside')
      insert(a, () => (left.get() ? player : null))
      insert(b, () => (left.get() ? null : player))
      return [a, b]
    })
    const button = root.querySelector('button')!
    button.click()
    flush()
    expect(root.innerHTML).toBe('<section><button>1</button></section><aside></aside>')

    left.set(false)
    flush()
    expect(root.innerHTML).toBe('<section></section><aside><button>1</button></aside>')
    expect(root.querySelector('button')).toBe(button)

    left.set(true)
    flush()
    expect(root.innerHTML).toBe('<section><button>1</button></section><aside></aside>')
    expect(log).toEqual(['init'])
  })

  test('moves rows between keyed lists (kanban)', () => {
    const log: string[] = []
    type Card = { id: number; col: 'todo' | 'done' }
    const cards = state<Card[]>([
      { id: 1, col: 'todo' },
      { id: 2, col: 'todo' },
    ])
    const root = render(() => {
      // Entries are first used inside list rows, but belong to this component.
      const view = keyedReparentable((id: number) => createComponent(counterComponent(log), { id }))
      const column = (col: Card['col']) => {
        const ul = document.createElement('ul')
        insert(
          ul,
          mapKeyed(
            () => cards.get().filter((c) => c.col === col),
            (c) => c.id,
            (c: State<Card>) => view(c.peek().id),
          ),
        )
        return ul
      }
      return [column('todo'), column('done')]
    })
    const [first] = root.querySelectorAll('button')
    first.click()
    flush()
    cards.set([
      { id: 1, col: 'done' },
      { id: 2, col: 'todo' },
    ])
    flush()
    expect(root.innerHTML).toBe('<ul><button>0</button></ul><ul><button>1</button></ul>')
    expect(root.querySelectorAll('ul')[1].firstChild).toBe(first)
    expect(log).toEqual(['init', 'init'])
  })

  test('keyed entries can be deleted', () => {
    const log: string[] = []
    let views!: ReturnType<typeof keyedReparentable<number>>
    const root = render(() => {
      views = keyedReparentable(() => createComponent(counterComponent(log), {}))
      return () => [views(1), views(2)]
    })
    expect(views.keys()).toEqual([1, 2])
    views.delete(1)
    expect(root.innerHTML).toBe('<button>0</button>')
    expect(views.keys()).toEqual([2])
    expect(log).toEqual(['init', 'init', 'destroy'])
  })

  test('stays alive while shown nowhere, and is destroyed with its creator', () => {
    const log: string[] = []
    const shown = state(true)
    let player!: Reparentable
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(() => {
      player = reparentable(() => createComponent(counterComponent(log), {}))
      return () => (shown.get() ? player : 'hidden')
    }, target)
    target.querySelector('button')!.click()
    flush()
    shown.set(false)
    flush()
    expect(target.innerHTML).toBe('hidden')
    shown.set(true)
    flush()
    expect(target.innerHTML).toBe('<button>1</button>')
    app.destroy()
    expect(log).toEqual(['init', 'destroy'])
    expect(player.disposed).toBe(true)
    expect(target.innerHTML).toBe('')
  })

  test('dispose() destroys the content and removes its nodes', () => {
    const log: string[] = []
    let player!: Reparentable
    const root = render(() => {
      player = reparentable(() => createComponent(counterComponent(log), {}))
      return () => player
    })
    expect(root.innerHTML).toBe('<button>0</button>')
    player.dispose()
    expect(root.innerHTML).toBe('')
    expect(log).toEqual(['init', 'destroy'])
    expect(player()).toEqual([])
  })

  test('is created lazily, with the context of the reparentable() call', () => {
    let created = 0
    const root = render(() => {
      const p = reparentable(() => (created++, 'x'))
      expect(created).toBe(0)
      return () => p
    })
    expect(created).toBe(1)
    expect(root.textContent).toBe('x')
  })
})

describe('native moveBefore', () => {
  const moved = withMoveBefore()

  for (const order of ['new place first', 'old place first'] as const) {
    test(`a reparented node is moved, never detached (${order})`, () => {
      const left = state(true)
      let el!: Node
      render(() => {
        const p = reparentable(() => (el = document.createElement('video')))
        const a = document.createElement('section')
        const b = document.createElement('aside')
        // Regions update in creation order: create the one that receives the node first or second.
        const intoA = () => insert(a, () => (left.get() ? p : null))
        const intoB = () => insert(b, () => (left.get() ? null : p))
        if (order === 'new place first') intoB(), intoA()
        else intoA(), intoB()
        return [a, b]
      })
      let detached = 0
      const observer = new MutationObserver((records) => {
        for (const r of records) if ([...r.removedNodes].includes(el) && !el.isConnected) detached++
      })
      observer.observe(document.body, { childList: true, subtree: true })
      left.set(false)
      flush()
      observer.disconnect()
      expect(el.parentNode!.nodeName).toBe('ASIDE')
      expect(moved).toContain(el)
      expect(detached).toBe(0)
    })
  }

  test('keyed list reorders use moveBefore for nodes in the document', () => {
    const list = state([1, 2, 3])
    const root = render(() =>
      mapKeyed(
        () => list.get(),
        (n) => n,
        (n) => {
          const li = document.createElement('li')
          li.textContent = String(n.peek())
          return li
        },
      ),
    )
    const [one, , three] = root.childNodes
    list.set([3, 2, 1])
    flush()
    expect(root.textContent).toBe('321')
    expect(moved).toContain(one)
    expect(moved).toContain(three)
  })

  test('falls back to insertBefore for detached parents', () => {
    const parent = document.createElement('div')
    const list = state([1, 2])
    const owner = mount(
      () =>
        mapKeyed(
          () => list.get(),
          (n) => n,
          (n) => document.createTextNode(String(n.peek())),
        ),
      parent,
    )
    list.set([2, 1])
    flush()
    expect(parent.textContent).toBe('21')
    expect(moved).toEqual([])
    owner.destroy()
  })
})

describe('moving into a branch that was just created', () => {
  const moved = withMoveBefore()

  test('the move waits until the new branch is attached, then happens natively', () => {
    const big = state(false)
    let el!: Node
    let seenByInit: Node | null = null
    const root = render(() => {
      const p = reparentable(() => (el = document.createElement('iframe')))
      return () =>
        big.get()
          ? (() => {
              const modal = document.createElement('dialog')
              insert(modal, () => p)
              return createComponent(() => {
                init(() => void (seenByInit = el.parentNode))
                return modal
              }, {})
            })()
          : (() => {
              const aside = document.createElement('aside')
              insert(aside, () => p)
              return aside
            })()
    })
    let detached = 0
    const observer = new MutationObserver((records) => {
      for (const r of records) if ([...r.removedNodes].includes(el) && !el.isConnected) detached++
    })
    observer.observe(document.body, { childList: true, subtree: true })
    big.set(true)
    flush()
    observer.disconnect()
    expect(root.innerHTML).toBe('<dialog><iframe></iframe></dialog>')
    expect(moved).toContain(el)
    expect(detached).toBe(0)
    expect(seenByInit!.nodeName).toBe('DIALOG')

    big.set(false)
    flush()
    expect(root.innerHTML).toBe('<aside><iframe></iframe></aside>')
  })

  test('flipping back and forth within one update ends in the right place', () => {
    const where = state<'a' | 'b'>('a')
    let el!: Node
    const root = render(() => {
      const p = reparentable(() => (el = document.createElement('video')))
      const a = document.createElement('section')
      insert(a, () => (where.get() === 'a' ? p : null))
      return [
        a,
        () => {
          const b = document.createElement('aside')
          insert(b, () => (where.get() === 'b' ? p : null))
          return b
        },
      ]
    })
    where.set('b')
    where.set('a')
    flush()
    expect(root.innerHTML).toBe('<section><video></video></section><aside></aside>')
    where.set('b')
    flush()
    where.set('a')
    flush()
    expect(el.parentNode!.nodeName).toBe('SECTION')
    expect(root.querySelectorAll('video').length).toBe(1)
    expect(root.innerHTML).not.toContain('<!---->')
  })
})

describe('imperative reparenting', () => {
  const moved = withMoveBefore()

  /** Content whose node list changes: a button, plus a <p> while `extra` is set. */
  function setup() {
    const log: string[] = []
    const extra = state(false)
    const shown = state(true)
    let player!: Reparentable
    const root = render(() => {
      player = reparentable(() => [
        createComponent(counterComponent(log), {}),
        () => (extra.get() ? document.createElement('p') : null),
      ])
      const slot = document.createElement('section')
      insert(slot, () => (shown.get() ? player : null))
      return slot
    })
    const elsewhere = document.createElement('div')
    elsewhere.id = 'elsewhere'
    document.body.appendChild(elsewhere)
    return { log, extra, shown, root, elsewhere, player: () => player }
  }

  test('moveTo() moves the live content natively and keeps it in sync there', () => {
    const { log, extra, root, elsewhere, player } = setup()
    const button = root.querySelector('button')!
    button.click()
    flush()
    player().moveTo(elsewhere)
    expect(root.innerHTML).toBe('<section></section>')
    expect(elsewhere.innerHTML).toBe('<button>1</button>')
    expect(elsewhere.firstChild).toBe(button)
    expect(moved).toContain(button)

    // Updates of the content follow it, and the place it left does not take it back.
    extra.set(true)
    flush()
    expect(elsewhere.innerHTML).toBe('<button>1</button><p></p>')
    expect(root.innerHTML).toBe('<section></section>')
    expect(log).toEqual(['init'])
  })

  test('a place in markup that renders it anew takes it back', () => {
    const { shown, root, elsewhere, player } = setup()
    player().moveTo(elsewhere)
    shown.set(false)
    flush()
    shown.set(true)
    flush()
    expect(root.innerHTML).toBe('<section><button>0</button></section>')
    expect(elsewhere.innerHTML).toBe('')
  })

  test('moveTo() accepts a selector and a node to insert before', () => {
    const { elsewhere, player } = setup()
    const first = document.createElement('hr')
    elsewhere.appendChild(first)
    player().moveTo('#elsewhere', first)
    expect(elsewhere.innerHTML).toBe('<button>0</button><hr>')
    expect(() => player().moveTo('#nope')).toThrow('no element matches')
  })

  test('remove() keeps the content alive; dispose() removes it from where it was moved', () => {
    const { log, root, elsewhere, player } = setup()
    root.querySelector('button')!.click()
    flush()
    player().remove()
    expect(root.innerHTML).toBe('<section></section>')
    expect(player().nodes()[0].textContent).toBe('1')
    player().moveTo(elsewhere)
    expect(elsewhere.innerHTML).toBe('<button>1</button>')
    player().dispose()
    expect(elsewhere.innerHTML).toBe('')
    expect(log).toEqual(['init', 'destroy'])
  })

  test('moveTo() creates content that was never rendered, and runs its init', () => {
    const log: string[] = []
    let player!: Reparentable
    render(() => {
      player = reparentable(() => createComponent(counterComponent(log), {}))
      return null
    })
    expect(player.nodes()).toEqual([])
    const target = document.createElement('div')
    document.body.appendChild(target)
    player.moveTo(target)
    expect(target.innerHTML).toBe('<button>0</button>')
    expect(log).toEqual(['init'])
  })

  test('moveNode() moves any node natively when it can', () => {
    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)
    const video = document.createElement('video')
    a.appendChild(video)
    moveNode(video, b)
    expect(video.parentNode).toBe(b)
    expect(moved).toEqual([video])
    const detached = document.createElement('div')
    moveNode(video, detached)
    expect(video.parentNode).toBe(detached)
    expect(moved).toEqual([video])
  })
})

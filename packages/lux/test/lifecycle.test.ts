import { describe, expect, test } from 'bun:test'
import { createComponent } from '../src/component'
import { destroy, init, props, update } from '../src/lifecycle'
import { Owner, flush, runWithOwner } from '../src/signal'
import { state, type State } from '../src/state'

const tick = () => Promise.resolve()

/** Create a component under a fresh root and flush mounts. */
function render<P extends Record<string, any>>(Comp: (p: P) => unknown, p = {} as P) {
  const root = new Owner(null)
  runWithOwner(root, () => createComponent(Comp, p))
  flush()
  return root
}

describe('init', () => {
  test('runs once after creation, not during setup', () => {
    const log: string[] = []
    const root = new Owner(null)
    runWithOwner(root, () =>
      createComponent(() => {
        init(() => {
          log.push('init')
        })
        log.push('setup')
      }, {}),
    )
    expect(log).toEqual(['setup'])
    flush()
    expect(log).toEqual(['setup', 'init'])
    flush()
    expect(log).toEqual(['setup', 'init'])
  })

  test('mounts automatically in a microtask if nobody flushes', async () => {
    let mounted = false
    runWithOwner(new Owner(null), () => createComponent(() => init(() => void (mounted = true)), {}))
    await tick()
    expect(mounted).toBe(true)
  })

  test('a returned function runs on destroy', () => {
    const log: string[] = []
    const root = render(() => init(() => () => log.push('init cleanup')))
    expect(log).toEqual([])
    root.dispose()
    expect(log).toEqual(['init cleanup'])
  })

  test('is untracked', async () => {
    const a = state(0)
    let runs = 0
    render(() =>
      init(() => {
        runs++
        a.get()
      }),
    )
    a.set(1)
    await tick()
    expect(runs).toBe(1)
  })

  test('throws outside a component', () => {
    expect(() => init(() => {})).toThrow(/component/)
  })
})

describe('update (auto-tracked)', () => {
  test('runs after mount, then when a state read inside changes', async () => {
    const a = state(1)
    const seen: number[] = []
    render(() => update(() => void seen.push(a.get())))
    expect(seen).toEqual([1])
    a.set(2)
    a.set(3)
    await tick()
    expect(seen).toEqual([1, 3])
  })

  test('a returned function cleans up before the next run and on destroy', async () => {
    const a = state(1)
    const log: string[] = []
    const root = render(() =>
      update(() => {
        const v = a.get()
        log.push(`run ${v}`)
        return () => log.push(`cleanup ${v}`)
      }),
    )
    a.set(2)
    await tick()
    root.dispose()
    expect(log).toEqual(['run 1', 'cleanup 1', 'run 2', 'cleanup 2'])
  })
})

describe('update (explicit deps)', () => {
  test('does not run on mount; runs only when a dep changes', async () => {
    const a = state(1)
    const b = state(1)
    const other = state(1)
    let runs = 0
    render(() =>
      update(() => {
        runs++
        other.get() // not a dependency: the body is untracked
      }, [a, b]),
    )
    expect(runs).toBe(0)
    other.set(2)
    await tick()
    expect(runs).toBe(0)
    a.set(2)
    await tick()
    expect(runs).toBe(1)
    a.set(3)
    b.set(3)
    await tick()
    expect(runs).toBe(2)
  })

  test('cleanup runs before the next run and on destroy', async () => {
    const a = state(1)
    const log: string[] = []
    const root = render(() =>
      update(() => {
        const v = a.peek()
        log.push(`run ${v}`)
        return () => log.push(`cleanup ${v}`)
      }, [a]),
    )
    a.set(2)
    await tick()
    a.set(3)
    await tick()
    root.dispose()
    expect(log).toEqual(['run 2', 'cleanup 2', 'run 3', 'cleanup 3'])
  })

  test('getter functions work as deps (used for props)', async () => {
    const a = state(1)
    let runs = 0
    render(() => update(() => void runs++, [() => a.get()]))
    a.set(2)
    await tick()
    expect(runs).toBe(1)
  })
})

describe('destroy and disposal order', () => {
  test('init/update run in declaration order; children mount before parents', () => {
    const log: string[] = []
    function Child() {
      init(() => void log.push('child init'))
      update(() => void log.push('child update'))
    }
    render(() => {
      init(() => void log.push('parent init 1'))
      update(() => void log.push('parent update'))
      createComponent(Child, {})
      init(() => void log.push('parent init 2'))
    })
    expect(log).toEqual(['child init', 'child update', 'parent init 1', 'parent update', 'parent init 2'])
  })

  test('children are destroyed before parents; callbacks in declaration order', () => {
    const log: string[] = []
    function Child({ name }: { name: string }) {
      destroy(() => log.push(`${name} destroy`))
      init(() => () => log.push(`${name} init cleanup`))
    }
    const root = render(() => {
      destroy(() => log.push('parent destroy 1'))
      createComponent(Child, { name: 'a' })
      createComponent(Child, { name: 'b' })
      destroy(() => log.push('parent destroy 2'))
    })
    root.dispose()
    expect(log).toEqual([
      'a destroy',
      'a init cleanup',
      'b destroy',
      'b init cleanup',
      'parent destroy 1',
      'parent destroy 2',
    ])
  })

  test('onUpdate inside a component is removed on destroy', () => {
    const a = state(0)
    let n = 0
    const root = render(() => {
      a.onUpdate(() => n++)
    })
    a.set(1)
    root.dispose()
    a.set(2)
    expect(n).toBe(1)
  })

  test('a component destroyed before mount never runs init', () => {
    let ran = false
    const root = new Owner(null)
    runWithOwner(root, () => createComponent(() => init(() => void (ran = true)), {}))
    root.dispose()
    flush()
    expect(ran).toBe(false)
  })

  test('update stops after destroy', async () => {
    const a = state(0)
    let runs = 0
    const root = render(() =>
      update(() => {
        runs++
        a.get()
      }),
    )
    root.dispose()
    a.set(1)
    await tick()
    expect(runs).toBe(1)
  })
})

describe('props', () => {
  test('props() returns the component props; getters stay reactive', async () => {
    const title = state('a')
    const seen: string[] = []
    render(
      () => {
        const p = props<{ title: string }>()
        update(() => void seen.push(p.title))
      },
      {
        get title() {
          return title.get()
        },
      },
    )
    title.set('b')
    await tick()
    expect(seen).toEqual(['a', 'b'])
  })

  test('the component function runs untracked', async () => {
    const a = state(0) as State<number>
    let setups = 0
    const root = new Owner(null)
    runWithOwner(root, () =>
      createComponent(() => {
        setups++
        a.get()
      }, {}),
    )
    a.set(1)
    await tick()
    expect(setups).toBe(1)
  })
})

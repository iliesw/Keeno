import { afterEach, describe, expect, test } from 'bun:test'
import { createComponent, mount, type MountedApp } from '../src/component'
import { insert } from '../src/dom'
import { hot } from '../src/hmr'
import { destroy, init } from '../src/lifecycle'
import { state } from '../src/state'

const tick = () => Promise.resolve()
let app: MountedApp | undefined
afterEach(() => {
  app?.destroy()
  document.body.innerHTML = ''
})

let n = 0
const uniqueId = () => `test-${n++}`

describe('hot', () => {
  test('returns the same wrapper for the same id', () => {
    const id = uniqueId()
    const a = hot(() => null, id)
    expect(hot(() => null, id)).toBe(a)
  })

  test('swapping the implementation re-mounts instances and keeps parent state', async () => {
    const id = uniqueId()
    const log: string[] = []
    const makeChild = (version: string) =>
      function Child(props: { count: number }) {
        init(() => void log.push(`init ${version}`))
        destroy(() => log.push(`destroy ${version}`))
        const el = document.createElement('span')
        insert(el, () => `${version}:${props.count}`)
        return el
      }

    const Child = hot(makeChild('v1'), id)
    const count = state(1)
    let parentSetups = 0
    function Parent() {
      parentSetups++
      const el = document.createElement('div')
      insert(
        el,
        createComponent(Child, {
          get count() {
            return count.get()
          },
        }),
      )
      return el
    }

    const target = document.createElement('div')
    document.body.appendChild(target)
    app = mount(Parent, target)
    count.set(5)
    await tick()
    expect(target.textContent).toBe('v1:5')

    hot(makeChild('v2'), id) // module re-executed with new code
    await tick()
    expect(target.textContent).toBe('v2:5') // parent state survived
    expect(parentSetups).toBe(1)
    expect(log).toEqual(['init v1', 'destroy v1', 'init v2'])

    count.set(6)
    await tick()
    expect(target.textContent).toBe('v2:6')
  })

  test('a hot root component can be swapped', async () => {
    const id = uniqueId()
    const App = hot(() => 'one', id)
    const target = document.createElement('div')
    app = mount(App, target)
    expect(target.textContent).toBe('one')
    hot(() => 'two', id)
    await tick()
    expect(target.textContent).toBe('two')
  })
})

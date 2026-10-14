// Islands: the server wraps `client=` components in <kn-island>, bootIslands hydrates them alone.
import { afterEach, describe, expect, test } from 'bun:test'
import { createComponent } from '../src/component'
import { Loading } from '../src/control'
import { getDocument, insert } from '../src/dom'
import { bootIslands, island } from '../src/island'
import { renderToString } from '../src/server'
import { derived, flush } from '../src/signal'
import { state } from '../src/state'

const tick = () => new Promise((r) => setTimeout(r, 0))

function Counter(props: { start: number }) {
  const n = state(props.start)
  const b = getDocument().createElement('button')
  b.className = 'counter'
  b.onclick = () => n.set(n.get() + 1)
  insert(b, () => `count ${n.get()}`)
  return b
}

function Greeting() {
  const text = derived(async () => 'from server')
  return createComponent(Loading, { fallback: () => '…', children: () => () => text.get() })
}

let stop: (() => void) | null = null
afterEach(() => {
  stop?.()
  stop = null
  document.body.innerHTML = ''
})

describe('islands', () => {
  test('the server renders <kn-island> with the props as data', async () => {
    const html = await renderToString(() => ['page ', island(Counter, { start: 5 }, 'visible', '/src/Counter.kn')])
    expect(html).toContain('page <kn-island')
    expect(html).toContain('data-id="/src/Counter.kn"')
    expect(html).toContain('data-strategy="visible"')
    expect(html).toContain('data-props="{&quot;start&quot;:5}"')
    expect(html).toContain('<button class="counter">count 5</button></kn-island>')
  })

  test('functions in props are an error', async () => {
    await expect(renderToString(() => island(Counter, { start: 1, onClick: () => {} }, 'load', '/src/C.kn'))).rejects.toThrow(
      'prop "onClick" is a function',
    )
  })

  test('in the browser, an island is a plain component', () => {
    const el = document.createElement('div')
    insert(el, () => island(Counter, { start: 2 }, 'load', '/src/Counter.kn'))
    expect(el.innerHTML).toBe('<button class="counter">count 2</button>')
  })

  test('bootIslands hydrates each island with its props and server data', async () => {
    const html = await renderToString(() => [
      island(Greeting, {}, 'load', '/src/Greeting.kn'),
      island(Counter, { start: 7 }, 'load', '/src/Lib.kn#Counter'),
    ])
    document.body.innerHTML = html
    let fetched = 0
    stop = bootIslands({
      '/src/Greeting.kn': async () => ({ default: Greeting }),
      '/src/Lib.kn': async () => {
        fetched++
        return { Counter }
      },
    })
    await tick()
    await tick()
    flush()
    expect(fetched).toBe(1)
    // The island's async value comes from the server data, so there is no loading fallback.
    expect(document.querySelector('kn-island')!.textContent).toBe('from server')
    const button = document.querySelector('.counter') as HTMLButtonElement
    expect(button.textContent).toBe('count 7')
    button.click()
    flush()
    expect(document.querySelector('.counter')!.textContent).toBe('count 8')
  })
})

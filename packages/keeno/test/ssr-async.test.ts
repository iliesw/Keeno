// Server rendering of async deriveds: renderToString waits, renderToStream streams, hydrate reuses.
import { afterEach, describe, expect, test } from 'bun:test'
import { createComponent, hydrate, type MountedApp } from '../src/component'
import { Loading, Portal } from '../src/control'
import { renderToStream, renderToString } from '../src/server'
import { derived } from '../src/signal'

const delay = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms))
const tick = () => new Promise((r) => setTimeout(r, 0))

const loading = (children: () => unknown, fallback = 'loading…') =>
  createComponent(Loading, { fallback: () => fallback, children })

async function readAll(stream: ReadableStream<string>): Promise<string[]> {
  const chunks: string[] = []
  const reader = stream.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) return chunks
    chunks.push(value)
  }
}

let apps: MountedApp[] = []
afterEach(() => {
  for (const a of apps) a.destroy()
  apps = []
  document.body.innerHTML = ''
})

describe('renderToString with async deriveds', () => {
  test('waits for the value and sends it to the client', async () => {
    const App = () => {
      const user = derived(async () => delay(5, { name: 'ada' }))
      return loading(() => () => `hi ${user.get().name}`)
    }
    const html = await renderToString(App)
    expect(html).toContain('hi ada')
    expect(html).toContain('<script type="application/json" data-keeno-data>{"k0":{"name":"ada"}}</script>')
  })

  test('escapes </script> in sent values', async () => {
    const App = () => {
      const v = derived(async () => '</script><b>')
      return loading(() => () => v.get())
    }
    const html = await renderToString(App)
    expect(html).toContain('"\\u003c/script>\\u003cb>"')
  })

  test('a value past the timeout renders the fallback and is not sent', async () => {
    const App = () => {
      const v = derived(async () => delay(200, 'late'))
      return loading(() => () => v.get())
    }
    const html = await renderToString(App, {}, { timeout: 20 })
    expect(html).toBe('loading…')
  })

  test('ssr: false values are awaited but not sent', async () => {
    const App = () => {
      const v = derived(async () => 'secret', { ssr: false })
      return loading(() => () => v.get())
    }
    expect(await renderToString(App)).toBe('secret')
  })

  test('concurrent renders keep their portals and data apart', async () => {
    const App = (p: { id: string; ms: number }) => {
      const v = derived(async () => delay(p.ms, p.id))
      return [loading(() => () => v.get()), createComponent(Portal, { children: () => `portal ${p.id}` })]
    }
    const [a, b] = await Promise.all([renderToString(App, { id: 'a', ms: 20 }), renderToString(App, { id: 'b', ms: 5 })])
    expect(a).toContain('portal a')
    expect(a).not.toContain('portal b')
    expect(a).toContain('{"k0":"a"}')
    expect(b).toContain('portal b')
    expect(b).toContain('{"k0":"b"}')
  })
})

describe('hydrate with server data', () => {
  test('reuses the sent value: renders synchronously, without fetching', async () => {
    let fetches = 0
    const App = () => {
      const user = derived(async () => (fetches++, delay(5, 'ada')))
      return loading(() => () => `hi ${user.get()}`)
    }
    const html = await renderToString(App)
    expect(fetches).toBe(1)
    const target = document.createElement('div')
    target.innerHTML = html
    document.body.appendChild(target)
    apps.push(hydrate(App, target))
    expect(target.textContent).toBe('hi ada')
    expect(fetches).toBe(2) // run only to track what it reads...
    await tick()
    expect(target.textContent).toBe('hi ada') // ...and its result is ignored
  })

  test('a fetch given the signal is aborted before it starts', async () => {
    const App = () => {
      const v = derived(async ({ signal }) => {
        if (signal.aborted) throw new Error('should not be awaited')
        return delay(1, 'server')
      })
      return loading(() => () => v.get())
    }
    const html = await renderToString(App)
    const target = document.createElement('div')
    target.innerHTML = html
    document.body.appendChild(target)
    apps.push(hydrate(App, target))
    await tick()
    expect(target.textContent).toBe('server')
  })
})

describe('renderToStream', () => {
  test('sends the shell with fallbacks, then each boundary', async () => {
    const App = () => {
      const fast = derived(async () => delay(5, 'fast'))
      const slow = derived(async () => delay(30, 'slow'))
      return [
        'header ',
        loading(() => () => fast.get(), 'f…'),
        ' ',
        loading(() => () => slow.get(), 's…'),
      ]
    }
    const chunks = await readAll(renderToStream(App))
    expect(chunks.length).toBe(3)
    expect(chunks[0]).toContain('header <!--kn-l:0-->f…<!--/kn-l:0--> <!--kn-l:1-->s…<!--/kn-l:1-->')
    expect(chunks[0]).toContain('window.$knl')
    expect(chunks[1]).toBe(
      '<script type="application/json" data-keeno-data>{"k0":"fast"}</script><template data-kn-l="0">fast</template><script>$knl("0")</script>',
    )
    expect(chunks[2]).toContain('<template data-kn-l="1">slow</template>')
  })

  test('nested boundaries: an inner one ready first goes out with the outer one', async () => {
    const App = () => {
      const outer = derived(async () => delay(20, 'outer'))
      const inner = derived(async () => delay(5, 'inner'))
      return loading(() => [() => outer.get(), ' ', loading(() => () => inner.get(), 'i…')], 'o…')
    }
    const chunks = await readAll(renderToStream(App))
    expect(chunks.length).toBe(2)
    expect(chunks[1]).toContain('<template data-kn-l="0">outer <!--kn-l:1-->inner<!--/kn-l:1--></template>')
  })

  test('the swap script puts the content in place of the fallback', async () => {
    const App = () => {
      const v = derived(async () => delay(5, 'done'))
      return ['a ', loading(() => () => v.get(), 'wait'), ' b']
    }
    const html = (await readAll(renderToStream(App))).join('')
    const target = document.createElement('div')
    document.body.appendChild(target)
    target.innerHTML = html
    // innerHTML doesn't run scripts: run them in order, like the browser does while streaming.
    for (const s of [...target.querySelectorAll('script:not([type])')]) new Function(s.textContent!)()
    const text = [...target.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')
    expect(text).toBe('a done b')
  })

  test('no boundary waiting: a single chunk', async () => {
    const chunks = await readAll(renderToStream(() => 'static'))
    expect(chunks).toEqual(['static'])
  })
})

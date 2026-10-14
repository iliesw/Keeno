// <Head>: tags in document.head, deepest wins, restored on unmount, collected during SSR.
import { afterEach, describe, expect, test } from 'bun:test'
import { createComponent, mount, type MountedApp } from '../src/component'
import { attr, getDocument, insert } from '../src/dom'
import { Head } from '../src/head'
import { renderToString, type RenderContext } from '../src/server'
import { flush } from '../src/signal'
import { state } from '../src/state'

let apps: MountedApp[] = []
afterEach(() => {
  for (const a of apps) a.destroy()
  apps = []
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

const el = (tag: string, attrs: Record<string, string | (() => string)> = {}, text?: () => string) => {
  const e = getDocument().createElement(tag)
  for (const [k, v] of Object.entries(attrs)) typeof v === 'function' ? attr(e, k, v) : e.setAttribute(k, v)
  if (text) insert(e, text)
  return e
}
const head = (...children: (() => Element)[]) => createComponent(Head, { children: () => children.map((c) => c()) })
const run = (App: () => unknown) => {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const app = mount(App, target)
  apps.push(app)
  return app
}
const titles = () => Array.from(document.head.querySelectorAll('title')).map((t) => t.textContent)
const meta = (name: string) => document.head.querySelector(`meta[name="${name}"]`)?.getAttribute('content')

describe('<Head>', () => {
  test('adds tags to document.head and keeps them reactive', () => {
    const t = state('Home')
    run(() => head(() => el('title', {}, () => `${t.get()} · Site`), () => el('meta', { name: 'description', content: () => t.get() })))
    expect(titles()).toEqual(['Home · Site'])
    expect(meta('description')).toBe('Home')
    t.set('About')
    flush()
    expect(titles()).toEqual(['About · Site'])
    expect(meta('description')).toBe('About')
  })

  test('the deepest <Head> wins, and the outer one comes back on unmount', () => {
    const page = state(true)
    run(() => [
      head(() => el('title', {}, () => 'Layout'), () => el('meta', { name: 'robots', content: 'index' })),
      () => (page.get() ? head(() => el('title', {}, () => 'Page')) : null),
    ])
    expect(titles()).toEqual(['Page'])
    expect(meta('robots')).toBe('index')
    page.set(false)
    flush()
    expect(titles()).toEqual(['Layout'])
  })

  test('replaces a static <title> and restores it when no <Head> sets one', () => {
    const original = document.createElement('title')
    original.textContent = 'Static'
    document.head.appendChild(original)
    const app = run(() => head(() => el('title', {}, () => 'Dynamic')))
    expect(titles()).toEqual(['Dynamic'])
    app.destroy()
    apps = []
    expect(titles()).toEqual(['Static'])
  })

  test('is collected into context.head during server rendering', async () => {
    const App = () => [head(() => el('title', {}, () => 'A & </title><script>'), () => el('meta', { property: 'og:title', content: 'A' })), 'body']
    const context: RenderContext = {}
    const html = await renderToString(App, {}, { context })
    expect(html).toBe('body')
    expect(context.head).toStartWith('<title data-kn-head="">A &amp; &lt;/title&gt;&lt;script&gt;</title><meta ')
    expect(context.head).toContain('property="og:title"')
    expect(context.head).toContain('data-kn-head')
  })
})

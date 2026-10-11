import { renderToString } from '@inflector/lux/server'
import App from './App.lx'
import { findPage, loadDoc, pages, slugFromPath } from './docs'
import { examples, findExample, loadExampleFiles } from './examples'

const SITE = 'Lux'
const DESCRIPTION = 'Lux is a compiled, signal-based frontend framework: HTML-first .lx components with fine-grained updates and no virtual DOM.'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

interface Meta {
  status: number
  title: string
  description: string
}

async function meta(pathname: string): Promise<Meta> {
  const notFound = { status: 404, title: `Not found · ${SITE}`, description: DESCRIPTION }
  if (pathname === '/') return { status: 200, title: `${SITE} · The compiled, signal-based UI framework`, description: DESCRIPTION }
  if (pathname === '/playground') {
    return { status: 200, title: `Playground · ${SITE}`, description: 'Write Lux components in the browser: the real compiler runs as you type, with a live preview, the compiled output and a console.' }
  }
  if (pathname === '/examples' || pathname === '/examples/') {
    return { status: 200, title: `Examples · ${SITE}`, description: `${examples.length} small Lux apps, running live: state, lists, forms, async data, transitions, portals and more.` }
  }
  const ex = pathname.match(/^\/examples\/([\w-]+)\/?$/)
  if (ex) {
    const e = findExample(ex[1])
    if (!e) return notFound
    await loadExampleFiles(e.slug)
    return { status: 200, title: `${e.title} · Examples · ${SITE}`, description: e.description }
  }
  const slug = slugFromPath(pathname)
  if (slug != null) {
    const doc = findPage(slug) && (await loadDoc(slug))
    if (!doc) return notFound
    return {
      status: 200,
      title: `${findPage(slug)!.title} · ${SITE}`,
      description: doc.raw.split('\n').find((l) => l && !/^[#`|>-]/.test(l))?.slice(0, 160) ?? DESCRIPTION,
    }
  }
  return notFound
}

export async function render(url: string) {
  const { pathname } = new URL(url, 'http://localhost')
  const { status, title, description } = await meta(pathname)
  const html = await renderToString(App, { url })
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  ].join('\n    ')
  return { html, head, status }
}

/** Every page, for prerendering. */
export function routes(): string[] {
  return ['/', ...pages.map((p) => `/docs/${p.slug}`), '/examples', ...examples.map((e) => `/examples/${e.slug}`), '/playground', '/404']
}

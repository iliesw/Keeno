import { renderToString } from '@inflector/keeno/server'
import App from './App.kn'
import { findPage, loadDoc, pages, slugFromPath } from './docs'
import { examples, findExample, loadExampleFiles } from './examples'

const SITE = 'Keeno'
const DESCRIPTION = 'Keeno is a compiled, signal-based frontend framework: HTML-first .kn components with fine-grained updates and no virtual DOM.'

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
    return { status: 200, title: `Playground · ${SITE}`, description: 'Write Keeno components in the browser: the real compiler runs as you type, with a live preview, the compiled output and a console.' }
  }
  if (pathname === '/examples' || pathname === '/examples/') {
    return { status: 200, title: `Examples · ${SITE}`, description: `${examples.length} small Keeno apps, running live: state, lists, forms, async data, transitions, portals and more.` }
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
      description: firstParagraph(doc.raw) ?? DESCRIPTION,
    }
  }
  return notFound
}

/** The first prose line of a markdown page, as plain text: no code, headings, lists or tables. */
function firstParagraph(md: string): string | undefined {
  let fenced = false
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced || !line || /^([#|><]|[-*+] |\d+\. |---)/.test(line)) continue
    const text = line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim()
    if (!text) continue
    return text.length > 160 ? text.slice(0, 157).replace(/\s+\S*$/, '') + '…' : text
  }
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
  return ['/', '/docs', ...pages.map((p) => `/docs/${p.slug}`), '/examples', ...examples.map((e) => `/examples/${e.slug}`), '/playground', '/404']
}

import { renderToString } from '@inflector/lux/server'
import App from './App.lx'
import { findPage, loadDoc, pages, slugFromPath } from './docs'

const SITE = 'Lux'
const DESCRIPTION = 'Lux is a compiled, signal-based frontend framework: HTML-first .lx components with fine-grained updates and no virtual DOM.'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

export async function render(url: string) {
  const { pathname } = new URL(url, 'http://localhost')
  let status = 200
  let title = `${SITE} · The compiled, signal-based UI framework`
  let description = DESCRIPTION

  const slug = slugFromPath(pathname)
  if (slug != null) {
    const doc = findPage(slug) && (await loadDoc(slug))
    if (doc) {
      title = `${findPage(slug)!.title} · ${SITE}`
      description = doc.raw.split('\n').find((l) => l && !/^[#`|>-]/.test(l))?.slice(0, 160) ?? DESCRIPTION
    } else status = 404
  } else if (pathname !== '/') status = 404
  if (status === 404) title = `Not found · ${SITE}`

  const html = await renderToString(App, { url })
  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
  ].join('\n    ')
  return { html, head, status }
}

/** Every page, for prerendering. */
export function routes(): string[] {
  return ['/', ...pages.map((p) => `/docs/${p.slug}`), '/404']
}

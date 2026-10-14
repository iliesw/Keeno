import { renderToString, type RenderContext } from '@inflector/keeno/server'
import App from './App.kn'
import { findPage, loadDoc, pages, slugFromPath } from './docs'
import { examples, findExample, loadExampleFiles } from './examples'

/** Load what the page needs before rendering it, and say whether it exists. */
async function prepare(pathname: string): Promise<boolean> {
  if (['/', '/playground', '/examples', '/examples/'].includes(pathname)) return true
  const ex = pathname.match(/^\/examples\/([\w-]+)\/?$/)
  if (ex) {
    const e = findExample(ex[1])
    if (e) await loadExampleFiles(e.slug)
    return !!e
  }
  const slug = slugFromPath(pathname)
  return slug != null && !!findPage(slug) && !!(await loadDoc(slug))
}

export async function render(url: string) {
  const { pathname } = new URL(url, 'http://localhost')
  const found = await prepare(pathname)
  // The pages' <Meta> tags fill context.head.
  const context: RenderContext = {}
  const html = await renderToString(App, { url }, { context })
  return { html, head: context.head ?? '', status: found ? 200 : 404 }
}

/** Every page, for prerendering. */
export function routes(): string[] {
  return ['/', '/docs', ...pages.map((p) => `/docs/${p.slug}`), '/examples', ...examples.map((e) => `/examples/${e.slug}`), '/playground', '/404']
}

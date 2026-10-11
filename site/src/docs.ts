// The docs: navigation order, and the rendered pages (loaded on demand, cached so SSR and
// hydration render the same page synchronously).

export interface Heading {
  id: string
  text: string
  depth: number
}

export interface DocModule {
  title: string
  html: string
  headings: Heading[]
  raw: string
  /** Date of the last commit to the page (YYYY-MM-DD), or ''. */
  updated: string
}

export interface NavItem {
  slug: string
  title: string
}

export const nav: { title: string; items: NavItem[] }[] = [
  {
    title: 'Getting Started',
    items: [
      { slug: 'introduction', title: 'Introduction' },
      { slug: 'getting-started', title: 'Quick Start' },
    ],
  },
  {
    title: 'Core Concepts',
    items: [
      { slug: 'components', title: 'Components' },
      { slug: 'reactivity', title: 'Reactivity' },
      { slug: 'state-options', title: 'State Options' },
      { slug: 'templates', title: 'Templates' },
      { slug: 'styles', title: 'Styles' },
      { slug: 'context', title: 'Context' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { slug: 'built-ins', title: 'Built-in Components' },
      { slug: 'routing', title: 'Routing' },
      { slug: 'ssr', title: 'Server Rendering' },
      { slug: 'security', title: 'Security' },
      { slug: 'tooling', title: 'Tooling' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { slug: 'api', title: 'API Reference' },
      { slug: 'stability', title: 'Versioning' },
    ],
  },
]

export const pages: NavItem[] = nav.flatMap((g) => g.items)

export const findPage = (slug: string) => pages.find((p) => p.slug === slug)

/** The markdown file of a page, relative to the repo root (for "edit on GitHub"). */
export const sourcePath = (slug: string) => (slug === 'introduction' ? `site/content/${slug}.md` : `docs/${slug}.md`)

const files = {
  ...import.meta.glob<DocModule>('../../docs/*.md', { import: 'default' }),
  ...import.meta.glob<DocModule>('../content/*.md', { import: 'default' }),
}

const loaders = new Map<string, () => Promise<DocModule>>()
for (const [file, load] of Object.entries(files)) loaders.set(file.match(/([\w-]+)\.md$/)![1], load)

const cache = new Map<string, DocModule>()

export function getDoc(slug: string): DocModule | undefined {
  return cache.get(slug)
}

export async function loadDoc(slug: string): Promise<DocModule | undefined> {
  const hit = cache.get(slug)
  if (hit) return hit
  const load = findPage(slug) && loaders.get(slug)
  if (!load) return undefined
  const doc = await load()
  cache.set(slug, doc)
  return doc
}

/** `/docs/x` → `x`; `/docs` → the first page. */
export function slugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/docs(?:\/([^/]+))?\/?$/)
  if (!m) return null
  return m[1] ? decodeURIComponent(m[1]) : pages[0].slug
}

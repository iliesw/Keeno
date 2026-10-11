// Site search: an index of every docs section, example and page, loaded the first time the
// search dialog opens, and a small scorer over it.
import { state } from '@inflector/keeno'
import { examples } from './examples'
import { nav } from './docs'

export const searchOpen = state(false)

export interface Entry {
  url: string
  /** Page title, e.g. "Reactivity". */
  page: string
  /** Section heading, or '' for the page itself. */
  heading: string
  text: string
  kind: 'doc' | 'example' | 'page'
}

export interface Hit extends Entry {
  score: number
  /** Text around the first match, split into plain and matched parts. */
  snippet: { text: string; hit: boolean }[]
}

const files = {
  ...import.meta.glob<{ title: string; sections: { id: string; heading: string; text: string }[] }>('../../docs/*.md', { query: '?search', import: 'default' }),
  ...import.meta.glob<{ title: string; sections: { id: string; heading: string; text: string }[] }>('../content/*.md', { query: '?search', import: 'default' }),
}

let index: Promise<Entry[]> | undefined

export function loadIndex(): Promise<Entry[]> {
  return (index ??= (async () => {
    const titles = new Map(nav.flatMap((g) => g.items).map((p) => [p.slug, p.title]))
    const entries: Entry[] = [
      { url: '/playground', page: 'Playground', heading: '', text: 'Write and run Keeno components in the browser, with the compiled output and a console.', kind: 'page' },
      { url: '/examples', page: 'Examples', heading: '', text: 'Live example apps: counter, todos, forms, async data, transitions, portals.', kind: 'page' },
    ]
    for (const e of examples) {
      entries.push({ url: `/examples/${e.slug}`, page: e.title, heading: '', text: `${e.description} ${e.concepts.map((c) => c.label).join(' ')}`, kind: 'example' })
    }
    await Promise.all(
      Object.entries(files).map(async ([file, load]) => {
        const slug = file.match(/([\w-]+)\.md$/)![1]
        const page = titles.get(slug)
        if (!page) return
        const doc = await load()
        for (const s of doc.sections) {
          entries.push({ url: `/docs/${slug}${s.id ? `#${s.id}` : ''}`, page, heading: s.id ? s.heading : '', text: s.text, kind: 'doc' })
        }
      }),
    )
    return entries
  })())
}

function snippet(text: string, words: string[]): Hit['snippet'] {
  const lower = text.toLowerCase()
  let at = -1
  for (const w of words) {
    const i = lower.indexOf(w)
    if (i >= 0 && (at < 0 || i < at)) at = i
  }
  const start = Math.max(0, at - 40)
  const slice = (start > 0 ? '…' : '') + text.slice(start, start + 140) + (start + 140 < text.length ? '…' : '')
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return slice
    .split(re)
    .filter(Boolean)
    .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }))
}

export function search(entries: Entry[], query: string): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const hits: Hit[] = []
  for (const e of entries) {
    const page = e.page.toLowerCase()
    const heading = e.heading.toLowerCase()
    const text = e.text.toLowerCase()
    let score = 0
    let all = true
    for (const w of words) {
      let s = 0
      if (heading === w || page === w) s += 12
      if (heading.startsWith(w)) s += 8
      else if (heading.includes(w)) s += 6
      if (page.startsWith(w)) s += 5
      else if (page.includes(w)) s += 3
      if (text.includes(w)) s += 1 + Math.min(2, text.split(w).length - 2)
      if (!s) {
        all = false
        break
      }
      score += s
    }
    if (!all) continue
    if (e.kind !== 'doc') score += 1
    if (!e.heading) score += 0.5
    hits.push({ ...e, score, snippet: snippet(e.text || e.heading, words) })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 12)
}

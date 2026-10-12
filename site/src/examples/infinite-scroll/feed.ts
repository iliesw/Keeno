export interface Post {
  id: number
  author: string
  color: string
  text: string
}

const AUTHORS = [
  ['Ada', '#f97316'],
  ['Grace', '#3b82f6'],
  ['Alan', '#22c55e'],
  ['Katherine', '#a855f7'],
  ['Margaret', '#ec4899'],
]
const LINES = [
  'Signals all the way down.',
  'Deleted the virtual DOM. Nobody noticed, except the bundle size.',
  'Compiled templates are just functions that build DOM.',
  'A derived value is a cache that knows when it is stale.',
  'Keyed lists keep focus where it belongs.',
  'Scoped CSS without a runtime.',
  'Wrote a component. It ran once. That was enough.',
]

const PAGE_SIZE = 8
const PAGES = 5

/** A fake paginated API: a page of posts after a short delay, and an empty page at the end. */
export function fetchPage(page: number): Promise<Post[]> {
  const posts =
    page >= PAGES
      ? []
      : Array.from({ length: PAGE_SIZE }, (_, i) => {
          const id = page * PAGE_SIZE + i + 1
          const [author, color] = AUTHORS[id % AUTHORS.length]
          return { id, author, color, text: LINES[(id * 3) % LINES.length] }
        })
  return new Promise((resolve) => setTimeout(() => resolve(posts), 600))
}

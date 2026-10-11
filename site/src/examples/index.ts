// The examples: shown live on /examples (compiled by Vite like any component) and loaded into
// the playground (as source, compiled in the browser). Each folder holds an App.kn entry.
import type { Component } from '@inflector/keeno'
import type { PlaygroundFile } from '../playground/types'

export interface Example {
  slug: string
  title: string
  description: string
  /** The APIs it shows, linked to their docs. */
  concepts: { label: string; href: string }[]
  category: 'Basics' | 'State' | 'Components' | 'Built-ins' | 'Styling'
  /** Load Tailwind in the playground. */
  tailwind?: boolean
}

export interface SourceFile {
  name: string
  raw: string
  /** Highlighted code block (rendered at build time). */
  html: string
}

export const examples: Example[] = [
  {
    slug: 'counter',
    title: 'Counter',
    description: 'The smallest Keeno app: a state, two derived values and a few buttons.',
    concepts: [
      { label: 'state()', href: '/docs/reactivity' },
      { label: 'derived()', href: '/docs/reactivity' },
    ],
    category: 'Basics',
  },
  {
    slug: 'todos',
    title: 'Todo list',
    description: 'Keyed lists, two-way binding, a child component and persistence to localStorage.',
    concepts: [
      { label: 'keyed lists', href: '/docs/templates' },
      { label: 'bind:value', href: '/docs/templates' },
      { label: 'persist', href: '/docs/state-options#persist' },
    ],
    category: 'Basics',
  },
  {
    slug: 'temperature',
    title: 'Temperature converter',
    description: 'One source of truth, with a validated state and values derived from it.',
    concepts: [
      { label: 'validate', href: '/docs/state-options#validate' },
      { label: 'derived()', href: '/docs/reactivity' },
    ],
    category: 'State',
  },
  {
    slug: 'pixel-art',
    title: 'Pixel art',
    description: 'A drawing grid with undo and redo, built on the history option of a state.',
    concepts: [
      { label: 'history', href: '/docs/state-options#history' },
      { label: 'init()', href: '/docs/components' },
    ],
    category: 'State',
  },
  {
    slug: 'search',
    title: 'Debounced search',
    description: 'Filter a list as you type, searching once typing pauses.',
    concepts: [
      { label: 'debounce', href: '/docs/state-options#debounce-and-throttle' },
      { label: 'update()', href: '/docs/reactivity' },
    ],
    category: 'State',
  },
  {
    slug: 'form',
    title: 'Form validation',
    description: 'Field errors, a password strength meter and touched state, all as derived values.',
    concepts: [
      { label: 'derived()', href: '/docs/reactivity' },
      { label: 'bind:checked', href: '/docs/templates' },
    ],
    category: 'State',
  },
  {
    slug: 'stopwatch',
    title: 'Stopwatch',
    description: 'requestAnimationFrame-driven timing with laps, cleaned up on destroy.',
    concepts: [
      { label: 'destroy()', href: '/docs/components' },
      { label: 'peek()', href: '/docs/reactivity' },
    ],
    category: 'Components',
  },
  {
    slug: 'clock',
    title: 'SVG clock',
    description: 'An analog clock: SVG markup with reactive attributes, ticking from an interval.',
    concepts: [
      { label: 'SVG', href: '/docs/templates' },
      { label: 'init() cleanup', href: '/docs/components' },
    ],
    category: 'Components',
  },
  {
    slug: 'context',
    title: 'Theme context',
    description: 'Provide a state once and read it anywhere below, without passing props down.',
    concepts: [
      { label: 'provide()', href: '/docs/context' },
      { label: 'inject()', href: '/docs/context' },
    ],
    category: 'Components',
  },
  {
    slug: 'tabs',
    title: 'Dynamic tabs',
    description: 'Switch between components with <Dynamic>; each tab mounts and unmounts.',
    concepts: [{ label: '<Dynamic>', href: '/docs/built-ins#dynamic' }],
    category: 'Built-ins',
  },
  {
    slug: 'async',
    title: 'Async data',
    description: 'Loading, success and error states of a request with <Await>.',
    concepts: [{ label: '<Await>', href: '/docs/built-ins#await' }],
    category: 'Built-ins',
  },
  {
    slug: 'error-boundary',
    title: 'Error boundary',
    description: 'Catch an error thrown while rendering, show a fallback, and reset.',
    concepts: [{ label: '<ErrorBoundary>', href: '/docs/built-ins#errorboundary' }],
    category: 'Built-ins',
  },
  {
    slug: 'toasts',
    title: 'Toasts',
    description: 'Notifications that animate in and out of a keyed list.',
    concepts: [{ label: '<Transition>', href: '/docs/built-ins#transition' }],
    category: 'Built-ins',
  },
  {
    slug: 'modal',
    title: 'Modal dialog',
    description: 'A dialog rendered into <body> with a portal, with enter and leave transitions.',
    concepts: [
      { label: '<Portal>', href: '/docs/built-ins#portal' },
      { label: 'children', href: '/docs/components' },
    ],
    category: 'Built-ins',
  },
  {
    slug: 'kanban',
    title: 'Kanban board',
    description: 'Cards that keep their state (notes, running timers) as they move between columns.',
    concepts: [{ label: 'keyedReparentable()', href: '/docs/built-ins#reparentable' }],
    category: 'Built-ins',
  },
  {
    slug: 'tailwind',
    title: 'Tailwind pricing',
    description: 'Utility classes in markup, with class arrays for conditional styles.',
    concepts: [
      { label: 'Tailwind CSS', href: '/docs/styles#tailwind-css' },
      { label: 'class arrays', href: '/docs/templates' },
    ],
    category: 'Styling',
    tailwind: true,
  },
]

export const categories = ['Basics', 'State', 'Components', 'Built-ins', 'Styling'] as const

const components = import.meta.glob<Component<any>>('./*/App.kn', { eager: true, import: 'default' })
// Sources (with their highlighted HTML) load on demand, so pages that only run examples don't ship them.
const sources = import.meta.glob<{ raw: string; html: string }>('./*/*.{kn,ts,css}', { import: 'default', query: '?highlight' })

export const findExample = (slug: string) => examples.find((e) => e.slug === slug)

export const exampleComponent = (slug: string): Component<any> | undefined => components[`./${slug}/App.kn`]

const cache = new Map<string, SourceFile[]>()

/** The files of an example, App.kn first, if they were loaded already. */
export const getExampleFiles = (slug: string): SourceFile[] | undefined => cache.get(slug)

export async function loadExampleFiles(slug: string): Promise<SourceFile[]> {
  const hit = cache.get(slug)
  if (hit) return hit
  const files = await Promise.all(
    Object.entries(sources)
      .filter(([path]) => path.startsWith(`./${slug}/`))
      .map(async ([path, load]) => ({ name: path.slice(slug.length + 3), ...(await load()) })),
  )
  files.sort((a, b) => (a.name === 'App.kn' ? -1 : b.name === 'App.kn' ? 1 : a.name.localeCompare(b.name)))
  cache.set(slug, files)
  return files
}

export const playgroundFiles = async (slug: string): Promise<PlaygroundFile[]> =>
  (await loadExampleFiles(slug)).map((f) => ({ name: f.name, code: f.raw }))

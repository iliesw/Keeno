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
    slug: 'store',
    title: 'Nested store',
    description: 'A grouped shopping list kept in one store(): mutate nested items directly, bind inputs to them, snapshot it.',
    concepts: [
      { label: 'store()', href: '/docs/reactivity#store' },
      { label: 'bind:value on a store', href: '/docs/reactivity#store' },
    ],
    category: 'State',
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
    slug: 'accordion',
    title: 'Accordion',
    description: 'An FAQ that opens one panel at a time, or several, animated with CSS grid rows.',
    concepts: [
      { label: 'class objects', href: '/docs/templates' },
      { label: 'bind:checked', href: '/docs/templates' },
    ],
    category: 'Basics',
  },
  {
    slug: 'tip-calculator',
    title: 'Tip calculator',
    description: 'Number and range inputs bound to states, with totals derived from them.',
    concepts: [
      { label: 'bind:value', href: '/docs/templates' },
      { label: 'validate', href: '/docs/state-options#validate' },
    ],
    category: 'Basics',
  },
  {
    slug: 'composer',
    title: 'Post composer',
    description: 'A character limit ring, hashtags and a feed, all derived from one textarea.',
    concepts: [
      { label: 'derived()', href: '/docs/reactivity' },
      { label: 'SVG attributes', href: '/docs/templates' },
    ],
    category: 'Basics',
  },
  {
    slug: 'sortable',
    title: 'Sortable list',
    description: 'Reorder rows by dragging or with the keyboard; keyed rows move and keep their DOM.',
    concepts: [{ label: 'keyed lists', href: '/docs/templates' }],
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
    slug: 'cart',
    title: 'Shopping cart',
    description: 'Quantities, a promo code and free-shipping threshold, persisted across reloads.',
    concepts: [
      { label: 'persist', href: '/docs/state-options#persist' },
      { label: 'derived()', href: '/docs/reactivity' },
    ],
    category: 'State',
  },
  {
    slug: 'unsaved-changes',
    title: 'Unsaved changes',
    description: 'A settings form that knows which fields differ from what was saved, compared by value.',
    concepts: [
      { label: 'deepEqual', href: '/docs/state-options#equals' },
      { label: 'equals', href: '/docs/state-options#equals' },
    ],
    category: 'State',
  },
  {
    slug: 'throttle',
    title: 'Throttle vs debounce',
    description: 'The same pointer position written to three states, to see how each option paces writes.',
    concepts: [
      { label: 'throttle', href: '/docs/state-options#debounce-and-throttle' },
      { label: 'onUpdate()', href: '/docs/api' },
    ],
    category: 'State',
  },
  {
    slug: 'wizard',
    title: 'Signup wizard',
    description: 'A multi-step form with per-step validation, a progress bar and a summary.',
    concepts: [
      { label: 'conditionals', href: '/docs/templates' },
      { label: 'validate', href: '/docs/state-options#validate' },
    ],
    category: 'State',
  },
  {
    slug: 'tic-tac-toe',
    title: 'Tic-tac-toe',
    description: 'The board is one state; the winner, the turn and time travel all come from it.',
    concepts: [
      { label: 'history', href: '/docs/state-options#history' },
      { label: 'derived()', href: '/docs/reactivity' },
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
    slug: 'rating',
    title: 'Star rating',
    description: 'A reusable component with default props, a callback and half-star display.',
    concepts: [
      { label: 'props()', href: '/docs/components' },
      { label: 'prop defaults', href: '/docs/components' },
    ],
    category: 'Components',
  },
  {
    slug: 'autocomplete',
    title: 'Autocomplete',
    description: 'A multi-select combobox with keyboard navigation and an element ref for focus.',
    concepts: [
      { label: 'ref()', href: '/docs/templates' },
      { label: 'update()', href: '/docs/reactivity' },
    ],
    category: 'Components',
  },
  {
    slug: 'infinite-scroll',
    title: 'Infinite scroll',
    description: 'Load the next page when a sentinel scrolls into view, with an IntersectionObserver.',
    concepts: [
      { label: 'ref()', href: '/docs/templates' },
      { label: 'init() cleanup', href: '/docs/components' },
    ],
    category: 'Components',
  },
  {
    slug: 'life',
    title: 'Game of Life',
    description: 'Conway’s cellular automaton, with a timer that restarts when the speed changes.',
    concepts: [
      { label: 'update(fn, deps)', href: '/docs/components' },
      { label: 'peek()', href: '/docs/reactivity' },
    ],
    category: 'Components',
  },
  {
    slug: 'memory',
    title: 'Memory game',
    description: 'Flip cards to find pairs, with a move counter, a timer and a persisted best score.',
    concepts: [
      { label: 'init()', href: '/docs/components' },
      { label: 'persist', href: '/docs/state-options#persist' },
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
    slug: 'async-derived',
    title: 'Async derived',
    description: 'An async derived inside <Loading>: refetches when its inputs change, keeps the old card while refreshing.',
    concepts: [
      { label: 'async derived', href: '/docs/reactivity#async-derived' },
      { label: '<Loading>', href: '/docs/built-ins#loading' },
      { label: 'pending()', href: '/docs/reactivity#async-derived' },
    ],
    category: 'Built-ins',
  },
  {
    slug: 'optimistic',
    title: 'Optimistic likes',
    description: 'Likes show at once and save in the background with the save option; a failed save rolls back and reports to an error boundary.',
    concepts: [
      { label: 'save', href: '/docs/state-options#save' },
      { label: 'pending()', href: '/docs/state-options#save' },
      { label: '<ErrorBoundary>', href: '/docs/built-ins#errorboundary' },
    ],
    category: 'State',
  },
  {
    slug: 'virtual-list',
    title: 'Virtual list',
    description: '100 000 rows that scroll smoothly: <Virtual> only renders the rows in view, with filtering and jump-to-row.',
    concepts: [
      { label: '<Virtual>', href: '/docs/built-ins#virtual' },
      { label: 'scrollTo()', href: '/docs/built-ins#virtual' },
    ],
    category: 'Built-ins',
  },
  {
    slug: 'head',
    title: 'Document head',
    description: 'A reactive tab title and meta description from inside a component, restored when it unmounts.',
    concepts: [{ label: '<Head>', href: '/docs/built-ins#head' }],
    category: 'Built-ins',
  },
  {
    slug: 'directives',
    title: 'Directives',
    description: 'Reusable DOM behaviors with use: — a reactive tooltip, click-outside, autosize, autofocus and an in-view observer.',
    concepts: [
      { label: 'use: directives', href: '/docs/directives' },
      { label: 'Directive type', href: '/docs/api#directives' },
    ],
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
    slug: 'lazy',
    title: 'Lazy loading',
    description: 'A component fetched on first render, preloaded on hover, with retry after a failed load.',
    concepts: [
      { label: 'lazy()', href: '/docs/built-ins#lazy' },
      { label: '<ErrorBoundary>', href: '/docs/built-ins#errorboundary' },
    ],
    category: 'Built-ins',
  },
  {
    slug: 'pip',
    title: 'Picture in picture',
    description: 'A player that moves between layouts and keeps playing, created once with reparentable().',
    concepts: [{ label: 'reparentable()', href: '/docs/built-ins#reparentable' }],
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
  {
    slug: 'theme-builder',
    title: 'Theme builder',
    description: 'States written into CSS custom properties, with every color derived in scoped CSS.',
    concepts: [
      { label: 'scoped CSS', href: '/docs/styles' },
      { label: 'style bindings', href: '/docs/templates' },
    ],
    category: 'Styling',
  },
  {
    slug: 'dashboard',
    title: 'Tailwind dashboard',
    description: 'Stat cards and a bar chart with hover details, styled with Tailwind utilities.',
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

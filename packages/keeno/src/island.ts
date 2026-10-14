// Islands: with `renderStrategy: 'islands'`, pages are plain server-rendered HTML, and only the
// components written with `client="load" | "idle" | "visible"` load their code and hydrate.
// The compiler turns `<Counter client="visible" start={5} />` into `island(Counter, props, …)`.
import { createComponent, hydrateWith, type Component, type MountedApp } from './component'
import { getDocument, insert, isServer } from './dom'
import { serverResponse } from './head'
import { Owner, currentRegistry, getOwner, installAsyncRegistry, onCleanup, runWithOwner, untrack } from './signal'

export type IslandStrategy = 'load' | 'idle' | 'visible'

/** Marks the owner of a server-rendered island: islands inside it are part of it. */
const ISLAND = Symbol('keeno.island')

function insideIsland(): boolean {
  for (let o = getOwner(); o; o = o.parent) if (o.context?.has(ISLAND)) return true
  return false
}

/** The props as JSON data. Functions and children can't be sent to the browser. */
function islandProps(props: Record<string, unknown>, name: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  untrack(() => {
    for (const key of Object.keys(props)) {
      if (key === 'children') throw new Error(`[keeno] <${name} client>: islands can't have children (their props must be JSON data)`)
      const value = props[key]
      if (typeof value === 'function' || typeof value === 'symbol') {
        throw new Error(`[keeno] <${name} client>: prop "${key}" is a ${typeof value}; island props must be JSON data`)
      }
      out[key] = value
    }
  })
  return out
}

/**
 * @internal A component written with `client="…"`. On the server it renders inside
 * `<kn-island>` with its props as data, for `bootIslands` to hydrate. In the browser it is a
 * plain component (an island inside an island hydrates with its parent).
 */
export function island(Comp: Component<any>, props: Record<string, unknown>, strategy: IslandStrategy, id: string): unknown {
  if (!isServer() || insideIsland()) return createComponent(Comp, props)
  const response = serverResponse()
  const n = response ? (response.islands = (response.islands ?? 0) + 1) - 1 : 0
  const el = getDocument().createElement('kn-island')
  el.setAttribute('data-id', id)
  el.setAttribute('data-strategy', strategy)
  el.setAttribute('data-n', String(n))
  // No box of its own: the page lays out as if the island's content were there directly.
  el.setAttribute('style', 'display:contents')
  el.setAttribute('data-props', JSON.stringify(islandProps(props, Comp.name || 'Island')))
  const owner = new Owner()
  ;(owner.context ??= new Map()).set(ISLAND, true)
  // Its async deriveds get ids of their own, which the browser uses when it hydrates the island alone.
  const parent = currentRegistry()
  if (parent) {
    const remove = installAsyncRegistry(owner, {
      next: 0,
      prefix: `i${n}:`,
      peek: () => undefined,
      created: (d) => parent.created(d),
      boundary: parent.boundary,
    })
    onCleanup(remove, owner)
  }
  runWithOwner(owner, () => insert(el, () => createComponent(Comp, props)))
  return el
}

/** How the browser gets an island's component: `import.meta.glob` of the `.kn` files. */
export type IslandManifest = Record<string, () => Promise<Record<string, unknown>>>

/**
 * Hydrate the `<kn-island>` elements of a server-rendered page: each one loads its component's
 * code when its strategy says (`load`: now, `idle`: when the browser is idle, `visible`: when it
 * scrolls into view). Returns a function that stops the pending ones and unmounts the others.
 */
export function bootIslands(manifest: IslandManifest, root: ParentNode = document): () => void {
  const apps: MountedApp[] = []
  const stops: (() => void)[] = []
  for (const el of Array.from(root.querySelectorAll('kn-island'))) {
    if (el.parentElement?.closest('kn-island')) continue
    const start = () => void hydrateIsland(el, manifest).then((app) => app && apps.push(app))
    const strategy = el.getAttribute('data-strategy')
    if (strategy === 'visible' && typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        start()
      })
      // A custom element is display: inline by default, so it may have no box to observe.
      io.observe(el.firstElementChild ?? el)
      stops.push(() => io.disconnect())
    } else if (strategy === 'idle' && typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(start)
      stops.push(() => cancelIdleCallback(handle))
    } else start()
  }
  return () => {
    for (const stop of stops) stop()
    for (const app of apps) app.destroy()
  }
}

async function hydrateIsland(el: Element, manifest: IslandManifest): Promise<MountedApp | null> {
  const id = el.getAttribute('data-id') ?? ''
  const [file, name = 'default'] = id.split('#')
  const load = manifest[file]
  if (!load) {
    console.error(`[keeno] island ${id}: no such component in the island manifest`)
    return null
  }
  const mod = await load()
  const Comp = mod[name] as Component<any> | undefined
  if (typeof Comp !== 'function') {
    console.error(`[keeno] island ${id}: the module has no component "${name}"`)
    return null
  }
  let props: Record<string, unknown> = {}
  try {
    props = JSON.parse(el.getAttribute('data-props') ?? '{}')
  } catch {
    // malformed: hydrate with no props
  }
  return hydrateWith(Comp, el, props, `i${el.getAttribute('data-n') ?? '0'}:`)
}

// Dev tools backend: tracks components, their states, renders, errors and state writes in
// development mode, and exposes them on `globalThis.__KEENO_DEVTOOLS__` for the console and for the
// in-page panel (`@inflector/keeno/devtools`). Nothing here runs unless `mount()` installs it.
import { setDevHook, type DevHook } from './dev'
import { ComponentOwner } from './lifecycle'
import { Computation, Derived, Owner, Signal, getOwner, untrack } from './signal'
import { State } from './state'

export interface DevComponent {
  id: number
  name: string
  /** Source file of a `.kn` component, relative to the Vite root. */
  file: string | null
  /** Times its computations re-ran after the first render. */
  updates: number
  errors: number
  children: DevComponent[]
}

export interface DevSignal {
  id: number
  name: string
  kind: 'state' | 'derived'
  value: unknown
  /** What the derived threw, when it failed. */
  error?: unknown
  history?: { past: number; future: number }
  persist?: string
  url?: string
  /** A debounced or throttled write is waiting, or an async derived is loading. */
  pending?: boolean
}

export interface DevDetails {
  id: number
  name: string
  file: string | null
  updates: number
  props: Record<string, unknown>
  states: DevSignal[]
  errors: unknown[]
}

export type DevEvent =
  | {
      type: 'write'
      seq: number
      time: number
      signal: number
      name: string
      component: number | null
      componentName: string | null
      old: unknown
      next: unknown
      source: string
    }
  | { type: 'error'; seq: number; time: number; component: number | null; componentName: string | null; error: unknown }

export interface DevStats {
  components: number
  signals: number
  flushes: number
  updates: number
  lastFlush: number
  maxFlush: number
  avgFlush: number
  /** Durations of the latest flushes, oldest first. */
  recent: number[]
  /** Components with the most updates. */
  top: { id: number; name: string; updates: number }[]
}

/** A route of a `<Router>`, as the router describes it (see `registerRouter`). */
export interface DevRoute {
  path: string
  component: string
  /** Layout names, outermost first. */
  layouts: string[]
  /** Statuses that have an error page. */
  errors: number[]
}

/** Where a `<Router>` is, as the router describes it. */
export interface DevLocation {
  /** Path without the router's base. */
  path: string
  search: string
  hash: string
  params: Record<string, string>
  /** The pattern of the matched route, or null. */
  matched: string | null
}

export interface DevNavigation extends DevLocation {
  seq: number
  time: number
}

/** What `@inflector/keeno-router` hands the dev tools for each browser `<Router>`. */
export interface DevRouterSource {
  base: string
  routes(): DevRoute[]
  location(): DevLocation
  navigate(to: string): void
}

export interface DevRouter {
  id: number
  base: string
  routes: DevRoute[]
  location: DevLocation
  /** Navigations since the router mounted, oldest first. */
  history: DevNavigation[]
}

export type DevMessage =
  | { type: 'flush'; ms: number; rendered: number[] }
  | { type: 'write' | 'error'; event: DevEvent }
  | { type: 'tree' }
  | { type: 'route' }

const LOG_LIMIT = 500
const RECENT_LIMIT = 80
const HISTORY_LIMIT = 100

/** Roots of the dev tools' own UI (see `mountDevtools`), which the dev tools ignore. */
export const internalRoots = new WeakSet<Owner>()

/** Install the dev tools hook (idempotent). `roots` are the owners of mounted apps. */
export function installDevtools(roots: Set<Owner>, legacy: Record<string, unknown>): void {
  const g = globalThis as any
  if (g.__KEENO_DEVTOOLS__?.version >= 2) return

  // Stable numeric ids for owners and signals, and a way back from an id.
  const ids = new WeakMap<object, number>()
  const refs = new Map<number, WeakRef<object>>()
  let nextId = 1
  const idOf = (o: object) => {
    let id = ids.get(o)
    if (id === undefined) {
      ids.set(o, (id = nextId++))
      refs.set(id, new WeakRef(o))
    }
    return id
  }
  const byId = (id: number) => {
    const o = refs.get(id)?.deref()
    if (!o) refs.delete(id)
    return o
  }

  const signalsOf = new WeakMap<Owner, Signal<any>[]>()
  const stores: WeakRef<Signal<any>>[] = []
  const tracked = new WeakSet<Signal<any>>()
  const nodesOf = new WeakMap<Owner, () => Node[]>()
  const updates = new WeakMap<Owner, number>()
  const errorsOf = new WeakMap<Owner, unknown[]>()
  const ownerOf = new WeakMap<object, ComponentOwner | null | false>()
  const ownerOfSignal = new WeakMap<Signal<any>, ComponentOwner>()
  const rendered = new Set<ComponentOwner>()
  const log: DevEvent[] = []
  const listeners = new Set<(m: DevMessage) => void>()
  let seq = 0
  let signalCount = 0
  const stats = { flushes: 0, updates: 0, total: 0, last: 0, max: 0, recent: [] as number[] }
  const seenErrors = new WeakSet<object>()
  /** Whether something other than the dev tools UI ran or changed since the last flush. */
  let external = false

  const isHot = (o: ComponentOwner) => !!(o.component as any)?.__keenoHot
  const nameOf = (o: ComponentOwner) => o.component?.name || 'Anonymous'
  const fileOf = (o: ComponentOwner) => ((o.component as any)?.__keenoFile as string | undefined) ?? null

  /** The component `o` belongs to, or false when it is part of the dev tools UI. */
  const classify = (o: Owner | null): ComponentOwner | null | false => {
    let comp: ComponentOwner | null = null
    let root: Owner | null = null
    for (; o; o = o.parent) {
      if (!comp && o instanceof ComponentOwner && !isHot(o)) comp = o
      root = o
    }
    return root && internalRoots.has(root) ? false : comp
  }

  const emit = (m: DevMessage) => {
    for (const fn of [...listeners]) {
      try {
        fn(m)
      } catch (err) {
        console.error('[keeno] dev tools listener failed:', err)
      }
    }
  }

  const record = (e: DevEvent) => {
    log.push(e)
    if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT)
    emit({ type: e.type, event: e } as DevMessage)
  }

  const hook: DevHook = {
    signal(s) {
      const sig = s as Signal<any>
      const owner = getOwner()
      if (classify(owner) === false) return
      tracked.add(sig)
      signalCount++
      if (!owner) {
        stores.push(new WeakRef(sig))
        if (stores.length > 500) stores.splice(0, stores.length - 500)
        return
      }
      // Only signals declared in the component body (or its init): ones created inside a
      // conditional branch or list row come and go with it.
      if (owner instanceof ComponentOwner) {
        let list = signalsOf.get(owner)
        if (!list) signalsOf.set(owner, (list = []))
        list.push(sig)
        ownerOfSignal.set(sig, owner)
      }
    },
    write(s, old, next, source) {
      const sig = s as Signal<any>
      if (!tracked.has(sig)) return
      external = true
      const owner = ownerOfSignal.get(sig) ?? null
      record({
        type: 'write',
        seq: ++seq,
        time: performance.now(),
        signal: idOf(sig),
        name: sig._name ?? `state#${idOf(sig)}`,
        component: owner ? idOf(owner) : null,
        componentName: owner ? nameOf(owner) : null,
        old,
        next,
        source,
      })
    },
    run(c) {
      let o = ownerOf.get(c)
      if (o === undefined) ownerOf.set(c, (o = classify((c as Computation).parent)))
      if (o === false) return
      external = true
      // The first render is not an update.
      if (!o?.mounted) return
      stats.updates++
      updates.set(o, (updates.get(o) ?? 0) + 1)
      rendered.add(o)
    },
    error(err, owner) {
      if (typeof err === 'object' && err !== null) {
        if (seenErrors.has(err)) return
        seenErrors.add(err)
      }
      const o = classify(owner as Owner | null)
      if (o === false) return
      if (o) {
        const list = errorsOf.get(o) ?? []
        list.push(err)
        if (list.length > 5) list.shift()
        errorsOf.set(o, list)
      }
      record({
        type: 'error',
        seq: ++seq,
        time: performance.now(),
        component: o ? idOf(o) : null,
        componentName: o ? nameOf(o) : null,
        error: err,
      })
    },
    component(owner, out) {
      const o = owner as ComponentOwner
      if (classify(o) === false) return
      if (typeof out === 'function') nodesOf.set(o, () => untrack(out as () => Node[]))
      else {
        const nodes: Node[] = []
        domNodes(out, nodes)
        nodesOf.set(o, () => nodes)
      }
      emit({ type: 'tree' })
    },
    flush(ms) {
      // A flush that only updated the dev tools UI is not reported (it would refresh the UI again).
      if (!external) return
      external = false
      stats.flushes++
      stats.total += ms
      stats.last = ms
      if (ms > stats.max) stats.max = ms
      stats.recent.push(ms)
      if (stats.recent.length > RECENT_LIMIT) stats.recent.shift()
      const ids: number[] = []
      for (const o of rendered) if (!o.disposed) ids.push(idOf(o))
      rendered.clear()
      emit({ type: 'flush', ms, rendered: ids })
    },
  }

  /** Visit live components depth-first (HMR wrappers are transparent). */
  const walk = (visit: (o: ComponentOwner, depth: number) => boolean | void) => {
    const go = (o: Owner, depth: number) => {
      if (o.disposed) return
      let d = depth
      if (o instanceof ComponentOwner && !isHot(o)) {
        if (visit(o, depth) === false) return
        d++
      }
      if (o.children) for (const c of o.children) go(c, d)
    }
    for (const r of roots) go(r, 0)
  }

  const tree = (): DevComponent[] => {
    const out: DevComponent[] = []
    const go = (o: Owner, into: DevComponent[]) => {
      if (o.disposed) return
      if (o instanceof ComponentOwner && !isHot(o)) {
        const node: DevComponent = {
          id: idOf(o),
          name: nameOf(o),
          file: fileOf(o),
          updates: updates.get(o) ?? 0,
          errors: errorsOf.get(o)?.length ?? 0,
          children: [],
        }
        into.push(node)
        into = node.children
      }
      if (o.children) for (const c of o.children) go(c, into)
    }
    for (const r of roots) go(r, out)
    return out
  }

  const describe = (s: Signal<any>): DevSignal => {
    const info: DevSignal = {
      id: idOf(s),
      name: s._name ?? `${s instanceof State ? 'state' : 'derived'}#${idOf(s)}`,
      kind: s instanceof State ? 'state' : 'derived',
      value: undefined,
    }
    if (s instanceof Derived && s._async) {
      // Read its fields: peek() would throw while it has no value yet, and could start a run.
      if (s._error) info.error = s._error.value
      else if (s._hasValue) info.value = s._value
      if (s._loading?.peek()) info.pending = true
    } else {
      try {
        info.value = s.peek()
      } catch (err) {
        info.error = err
      }
    }
    if (s instanceof State) {
      if (s._history) info.history = { past: s._history.past.length, future: s._history.future.length }
      if (s._persistKey) info.persist = s._persistKey
      if (s._url) info.url = s._url.param
      if (s._pending) info.pending = true
    }
    return info
  }

  const component = (id: number) => {
    const o = byId(id)
    return o instanceof ComponentOwner && !o.disposed ? o : null
  }
  const signal = (id: number) => {
    const s = byId(id)
    return s instanceof Signal ? s : null
  }

  const details = (id: number): DevDetails | null => {
    const o = component(id)
    if (!o) return null
    const props: Record<string, unknown> = {}
    untrack(() => {
      for (const key of Object.keys(o.props)) {
        try {
          props[key] = o.props[key]
        } catch (err) {
          props[key] = err
        }
      }
    })
    const states = (signalsOf.get(o) ?? []).filter((s) => !(s instanceof Derived && s.disposed)).map(describe)
    return { id, name: nameOf(o), file: fileOf(o), updates: updates.get(o) ?? 0, props, states, errors: errorsOf.get(o) ?? [] }
  }

  const nodes = (id: number): Node[] => {
    const o = component(id)
    if (!o) return []
    const out: Node[] = []
    const visit = (c: Owner) => {
      const get = nodesOf.get(c)
      if (get) return void out.push(...get())
      // A wrapper (HMR) or a component created outside createComponent: use its children.
      if (c.children) for (const child of c.children) visit(child)
    }
    visit(o)
    return out.filter((n) => n.isConnected)
  }

  const routers = new Map<number, { source: DevRouterSource; history: DevNavigation[] }>()
  let nextRouter = 1
  let navSeq = 0

  const api = {
    ...legacy,
    version: 2,
    /**
     * Called by each browser `<Router>`. Call `changed()` after every navigation, and `dispose()`
     * when the router unmounts.
     */
    registerRouter(source: DevRouterSource): { changed(): void; dispose(): void } {
      const id = nextRouter++
      const entry = { source, history: [] as DevNavigation[] }
      routers.set(id, entry)
      const changed = () => {
        let loc: DevLocation
        try {
          loc = untrack(() => source.location())
        } catch {
          return
        }
        const last = entry.history[entry.history.length - 1]
        if (last && last.path === loc.path && last.search === loc.search && last.hash === loc.hash) return
        entry.history.push({ ...loc, seq: ++navSeq, time: performance.now() })
        if (entry.history.length > HISTORY_LIMIT) entry.history.shift()
        emit({ type: 'route' })
      }
      changed()
      return {
        changed,
        dispose() {
          if (routers.delete(id)) emit({ type: 'route' })
        },
      }
    },
    routers(): DevRouter[] {
      return [...routers].map(([id, { source, history }]) => ({
        id,
        base: source.base,
        routes: untrack(() => source.routes()),
        location: untrack(() => source.location()),
        history: history.slice(),
      }))
    },
    navigate(router: number, to: string) {
      routers.get(router)?.source.navigate(to)
    },
    components: tree,
    details,
    nodes,
    /** The innermost component whose DOM contains `target`. */
    at(target: Node): number | null {
      let best: ComponentOwner | null = null
      let bestDepth = -1
      walk((o, depth) => {
        if (depth <= bestDepth) return
        const get = nodesOf.get(o)
        if (get && get().some((n) => n === target || n.contains(target))) {
          best = o
          bestDepth = depth
        }
      })
      return best ? idOf(best) : null
    },
    /** Ids from the root down to the component `id` (for revealing it in the tree). */
    path(id: number): number[] {
      const out: number[] = []
      for (let o: Owner | null = component(id); o; o = o.parent) if (o instanceof ComponentOwner && !isHot(o)) out.unshift(idOf(o))
      return out
    },
    /** States and deriveds declared outside components (stores). */
    stores(): DevSignal[] {
      const live: DevSignal[] = []
      for (let i = stores.length - 1; i >= 0; i--) {
        const s = stores[i]!.deref()
        if (!s || (s instanceof Derived && s.disposed)) stores.splice(i, 1)
        else live.unshift(describe(s))
      }
      return live
    },
    set(id: number, value: unknown): boolean {
      const s = signal(id)
      if (!(s instanceof State)) return false
      s.set(value)
      return true
    },
    undo(id: number) {
      const s = signal(id)
      if (s instanceof State) s.undo()
    },
    redo(id: number) {
      const s = signal(id)
      if (s instanceof State) s.redo()
    },
    log: (): DevEvent[] => log.slice(),
    clearLog() {
      log.length = 0
    },
    stats(): DevStats {
      let components = 0
      const top: DevStats['top'] = []
      walk((o) => {
        components++
        const n = updates.get(o) ?? 0
        if (n) top.push({ id: idOf(o), name: nameOf(o), updates: n })
      })
      top.sort((a, b) => b.updates - a.updates)
      return {
        components,
        signals: signalCount,
        flushes: stats.flushes,
        updates: stats.updates,
        lastFlush: stats.last,
        maxFlush: stats.max,
        avgFlush: stats.flushes ? stats.total / stats.flushes : 0,
        recent: stats.recent.slice(),
        top: top.slice(0, 12),
      }
    },
    resetStats() {
      Object.assign(stats, { flushes: 0, updates: 0, total: 0, last: 0, max: 0, recent: [] })
      walk((o) => void updates.delete(o))
    },
    subscribe(fn: (m: DevMessage) => void): () => void {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    /** Put the component in `$keeno` (and log it): `$keeno.states.count.set(3)` in the console. */
    expose(id: number, log = true) {
      const o = component(id)
      if (!o) return
      const named: Record<string, Signal<any>> = {}
      for (const s of signalsOf.get(o) ?? []) named[s._name ?? `#${idOf(s)}`] = s
      const value = { name: nameOf(o), file: fileOf(o), props: o.props, states: named, nodes: nodes(id), owner: o }
      g.$keeno = value
      if (log) console.log(`%c<${value.name}>%c → $keeno`, 'color:#f5b942;font-weight:bold', 'color:inherit', value)
    },
  }

  g.__KEENO_DEVTOOLS__ = api
  setDevHook(hook)
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('keeno:devtools'))
  }
}

/** The DOM nodes in a static render result (strings become text nodes later, so they are skipped). */
function domNodes(value: unknown, out: Node[]) {
  if (Array.isArray(value)) for (const v of value) domNodes(v, out)
  else if (typeof value === 'object' && value !== null && typeof (value as Node).nodeType === 'number') {
    const n = value as Node
    if (n.nodeType === 11) out.push(...n.childNodes)
    else out.push(n)
  }
}

// Built-in control components: ErrorBoundary, Portal, Await and lazy().
import { createComponent, type Children, type Component } from './component'
import { getDocument, insert, isServer, region } from './dom'
import { callerScope } from './lifecycle'
import {
  createComputation,
  currentRegistry,
  getOwner,
  NotReady,
  onCleanup,
  untrack,
  type Derived,
  type LoadingBoundary,
} from './signal'
import { State } from './state'

// ---------------------------------------------------------------------------
// ErrorBoundary

export interface ErrorBoundaryProps {
  /**
   * Rendered instead of the children after one of them throws. A function receives the error and
   * a `reset` that renders the children again.
   */
  fallback?: ((error: unknown, reset: () => void) => unknown) | string | number | Node | null
  /** Called with each caught error (for logging). */
  onError?: (error: unknown) => void
  children?: Children
}

/**
 * Catch errors thrown while rendering, updating or mounting the components inside it (including
 * `init` and `update` callbacks), and show `fallback` instead. Errors in event handlers, timers
 * and promises are not caught: they don't happen while rendering.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): unknown {
  const error = new State<{ value: unknown } | null>(null)
  const owner = getOwner()!
  owner.onError = (err) => {
    // A value that isn't ready yet is for <Loading>, not an error.
    if (err instanceof NotReady) throw err
    // An error in the fallback itself goes to the next boundary up.
    if (error.peek()) throw err
    props.onError?.(err)
    error.set({ value: err })
  }
  const reset = () => error.set(null)
  return () => {
    const e = error.get()
    if (!e) return props.children?.()
    const fallback = props.fallback
    return typeof fallback === 'function' ? untrack(() => fallback(e.value, reset)) : fallback
  }
}

// ---------------------------------------------------------------------------
// Loading

export interface LoadingProps {
  /** Rendered while an async derived read inside has no value yet. */
  fallback?: (() => unknown) | string | number | Node | null
  children?: Children
}

/**
 * Show `fallback` while an async derived read by the children has no value yet:
 * `<Loading fallback={() => <Spinner />}><Profile /></Loading>`. The children are created once and
 * kept while the fallback shows, so their state survives. Re-runs of a derived that already has a
 * value keep the content (see `pending()`).
 */
export function Loading(props: LoadingProps): unknown {
  const waiting = new State<Set<Derived<any>>>(new Set(), { equals: () => false })
  const owner = getOwner()!
  owner.onError = (err) => {
    if (!(err instanceof NotReady)) throw err
    const d = err.derived
    const set = waiting.peek()
    if (set.has(d)) return
    set.add(d)
    waiting.set(set)
    void d._settled().then(() => {
      if (owner.disposed || !set.delete(d)) return
      waiting.set(set)
    })
  }
  // Streaming server render: tell the stream about this boundary, and mark where its content goes.
  const registry = isServer() ? currentRegistry() : null
  let boundary: LoadingBoundary | null = null
  if (registry?.boundary) {
    let parent: LoadingBoundary | null = null
    for (let o = owner.parent; o && !parent; o = o.parent) parent = (o.context?.get(BOUNDARY) as LoadingBoundary) ?? null
    boundary = { waiting: () => waiting.get().size, content: () => content(), parent }
    ;(owner.context ??= new Map()).set(BOUNDARY, boundary)
    registry.boundary(boundary)
  }
  const content = region(() => props.children?.())
  const view = () => {
    if (!waiting.get().size) return content()
    const fallback = props.fallback
    return typeof fallback === 'function' ? untrack(fallback) : fallback
  }
  if (!boundary) return view
  const doc = getDocument()
  return [doc.createComment(`kn-l:${boundary.id}`), view, doc.createComment(`/kn-l:${boundary.id}`)]
}

/** Key of the enclosing <Loading> in an owner's context (streaming server renders only). */
const BOUNDARY = Symbol('keeno.loading')

// ---------------------------------------------------------------------------
// Portal

/** @internal Key, in the root owner's context, of where server-rendered portals go (per render). */
export const PORTAL_OUTLET = Symbol('keeno.portals')

function serverOutlet(): Element | null {
  for (let o = getOwner(); o; o = o.parent) {
    const el = o.context?.get(PORTAL_OUTLET)
    if (el) return el as Element
  }
  return null
}

export interface PortalProps {
  /** Where to render: an element, or a CSS selector (default `document.body`). */
  target?: Node | string
  children?: Children
}

/**
 * Render the children at the end of another element (for modals, toasts and popovers), while
 * they stay part of this component tree: context, error boundaries and destroy work as usual.
 */
export function Portal(props: PortalProps): unknown {
  const where = untrack(() => props.target)
  // On the server the target isn't part of the HTML being rendered: render into the outlet that
  // renderToString() appends after the app (hydrate() then renders the portal at its target).
  if (isServer()) {
    const outlet = serverOutlet()
    if (!outlet) return null
    const holder = getDocument().createElement('div')
    holder.setAttribute('data-keeno-portal', typeof where === 'string' ? where : '')
    outlet.appendChild(holder)
    insert(holder, () => props.children?.())
    return null
  }
  const target = typeof where === 'string' ? getDocument().querySelector(where) : where ?? getDocument().body
  if (!target) throw new Error(`[keeno] <Portal>: no element matches ${String(where)}`)
  const nodes = insert(target, () => props.children?.())
  onCleanup(() => {
    for (const n of nodes()) n.parentNode?.removeChild(n)
  })
  return null
}

// ---------------------------------------------------------------------------
// Await

export interface AwaitProps<T> {
  /** The promise to wait for (or a plain value). A new promise restarts the wait. */
  promise: PromiseLike<T> | T
  /** Rendered while the promise is pending. */
  pending?: () => unknown
  /** Rendered with the resolved value. */
  fulfilled?: (value: T) => unknown
  /** Rendered with the rejection reason. Without it, the error goes to the closest ErrorBoundary. */
  rejected?: (error: unknown) => unknown
}

type Settled<T> = { status: 'pending' } | { status: 'fulfilled'; value: T } | { status: 'rejected'; error: unknown }

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (typeof v === 'object' || typeof v === 'function') && v !== null && typeof (v as any).then === 'function'
}

/**
 * Render the states of a promise:
 * `<Await promise={load(id)} pending={() => <Spinner />} fulfilled={(user) => <Profile user={user} />} />`.
 * Results of a promise that was replaced in the meantime are ignored.
 */
export function Await<T>(props: AwaitProps<T>): unknown {
  const settled = new State<Settled<T>>({ status: 'pending' })
  createComputation(() => {
    const p = props.promise
    untrack(() => {
      if (!isThenable(p)) return settled.set({ status: 'fulfilled', value: p as T })
      let current = true
      onCleanup(() => (current = false))
      settled.set({ status: 'pending' })
      p.then(
        (value) => current && settled.set({ status: 'fulfilled', value: value as T }),
        (error) => current && settled.set({ status: 'rejected', error }),
      )
    })
  })
  return () => {
    const s = settled.get()
    if (s.status === 'pending') return untrack(() => props.pending?.())
    if (s.status === 'fulfilled') return untrack(() => (props.fulfilled ? props.fulfilled(s.value) : (s.value as unknown)))
    if (props.rejected) return untrack(() => props.rejected!(s.error))
    throw s.error
  }
}

// ---------------------------------------------------------------------------
// lazy

type Loaded<P> = Component<P> | { default: Component<P> }

export interface LazyOptions {
  /** Rendered while the component loads. */
  pending?: () => unknown
}

export type LazyComponent<P> = Component<P> & {
  /** Start loading now (for example on hover), before the component is rendered. */
  preload(): Promise<Component<P>>
}

/**
 * A component loaded on first render with a dynamic import: `const Chart = lazy(() => import('./Chart.kn'))`.
 * A failed load goes to the closest ErrorBoundary; rendering the component again retries it.
 */
export function lazy<P extends Record<string, any> = Record<string, any>>(
  load: () => Promise<Loaded<P>>,
  options: LazyOptions = {},
): LazyComponent<P> {
  const loaded = new State<Component<P> | undefined>(undefined)
  let promise: Promise<Component<P>> | undefined

  const preload = () =>
    (promise ??= load().then(
      (m) => {
        const C = typeof m === 'function' ? m : m.default
        loaded.set(C)
        return C
      },
      (error) => {
        promise = undefined
        throw error
      },
    ))

  const Lazy = ((props: P) => {
    // Per instance: a failure shows in the instances that were waiting, and a new one retries.
    const failed = new State<{ error: unknown } | null>(null)
    if (!loaded.peek()) preload().catch((error) => failed.set({ error }))
    const scope = callerScope() ?? undefined
    return () => {
      const f = failed.get()
      if (f) throw f.error
      const C = loaded.get()
      return C ? untrack(() => createComponent(C, props, scope)) : untrack(() => options.pending?.())
    }
  }) as LazyComponent<P>
  Lazy.preload = preload
  return Lazy
}

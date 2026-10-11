// Built-in control components: ErrorBoundary, Portal, Await and lazy().
import { createComponent, type Children, type Component } from './component'
import { getDocument, insert } from './dom'
import { createComputation, getOwner, onCleanup, untrack } from './signal'
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
// Portal

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
  const target = typeof where === 'string' ? getDocument().querySelector(where) : where ?? getDocument().body
  if (!target) throw new Error(`[lux] <Portal>: no element matches ${String(where)}`)
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
 * A component loaded on first render with a dynamic import: `const Chart = lazy(() => import('./Chart.lx'))`.
 * A failed load goes to the closest ErrorBoundary; rendering the component again retries it.
 */
export function lazy<P extends Record<string, any> = Record<string, any>>(
  load: () => Promise<Loaded<P>>,
  options: LazyOptions = {},
): LazyComponent<P> {
  const loaded = new State<Component<P> | undefined>(undefined)
  const failed = new State<{ error: unknown } | null>(null)
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
        failed.set({ error })
        throw error
      },
    ))

  const Lazy = ((props: P) => {
    if (failed.peek()) failed.set(null)
    if (!loaded.peek()) preload().catch(() => {})
    return () => {
      const f = failed.get()
      if (f) throw f.error
      const C = loaded.get()
      return C ? untrack(() => createComponent(C, props)) : untrack(() => options.pending?.())
    }
  }) as LazyComponent<P>
  Lazy.preload = preload
  return Lazy
}

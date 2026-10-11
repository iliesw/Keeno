// Core reactive graph: owners, computations, signals (base of State and Derived) and the scheduler.

export type Cleanup = () => void
export type UpdateListener<T> = (old: T, next: T) => void
export type Equals<T> = (a: T, b: T) => boolean

/** Something that reads signals and is told when they change (computations and deriveds). */
interface Listener {
  sources: Signal<any>[]
  disposed: boolean
  notify(): void
}

let currentOwner: Owner | null = null
let currentListener: Listener | null = null

// Two copies of the runtime don't share this tracking state, so components from one copy break
// when rendered by the other (typically the `development` and default builds mixed during SSR).
const INSTANCE = Symbol.for('lux.runtime')
if ((globalThis as any)[INSTANCE]) {
  console.warn(
    '[lux] two copies of @inflector/lux are loaded. Components and the functions that render them ' +
      '(mount, renderToString) must come from the same copy: with Vite SSR, import renderToString ' +
      'in a module loaded through ssrLoadModule, not directly in Node.',
  )
} else (globalThis as any)[INSTANCE] = true

/** A node in the ownership tree. Disposing an owner disposes its children, then runs its cleanups. */
export class Owner {
  parent: Owner | null
  children: Owner[] | null = null
  cleanups: Cleanup[] | null = null
  disposed = false
  /** Values provided to descendants with `provide()`, keyed by context id. */
  context: Map<symbol, unknown> | null = null
  /** Handles errors thrown by descendants (see `handleError`). Rethrow to pass them further up. */
  onError: ((error: unknown) => void) | null = null

  constructor(parent: Owner | null = currentOwner) {
    this.parent = parent
    if (parent) (parent.children ??= []).push(this)
  }

  /** Dispose children and run cleanups, but keep this owner alive. */
  reset() {
    const children = this.children
    this.children = null
    if (children) for (const child of children) child.dispose(true)
    const cleanups = this.cleanups
    this.cleanups = null
    if (cleanups) for (const fn of cleanups) runCleanup(fn)
  }

  dispose(fromParent = false) {
    if (this.disposed) return
    this.disposed = true
    this.reset()
    if (!fromParent && this.parent?.children) {
      const i = this.parent.children.indexOf(this)
      if (i >= 0) this.parent.children.splice(i, 1)
    }
  }
}

/** Errors that already went up the whole owner chain without a handler, so outer levels don't retry. */
const unhandled = new WeakSet<object>()

/**
 * Pass `error` to the nearest owner (starting at `owner`) with an `onError` handler. A handler
 * that throws passes its error further up. Throws when no handler takes it.
 */
export function handleError(error: unknown, owner: Owner | null): void {
  if (typeof error === 'object' && error !== null && unhandled.has(error)) throw error
  for (let o = owner; o; o = o.parent) {
    if (!o.onError || o.disposed) continue
    try {
      o.onError(error)
      return
    } catch (err) {
      error = err
    }
  }
  if (typeof error === 'object' && error !== null) unhandled.add(error)
  throw error
}

function runCleanup(fn: Cleanup) {
  try {
    fn()
  } catch (err) {
    console.error('[lux] error in cleanup:', err)
  }
}

function unlinkSources(l: Listener) {
  for (const s of l.sources) s._observers?.delete(l)
  l.sources = []
}

export type ComputationKind = 'render' | 'user'

/** A tracked function. It re-runs (batched, in a microtask) when any signal it read changes. */
export class Computation extends Owner implements Listener {
  fn: () => void
  kind: ComputationKind
  sources: Signal<any>[] = []
  queued = false

  constructor(fn: () => void, kind: ComputationKind) {
    super()
    this.fn = fn
    this.kind = kind
  }

  notify() {
    enqueue(this)
  }

  run() {
    if (this.disposed) return
    this.reset()
    unlinkSources(this)
    const prevOwner = currentOwner
    const prevListener = currentListener
    currentOwner = this
    currentListener = this
    try {
      this.fn()
    } catch (err) {
      currentOwner = prevOwner
      currentListener = prevListener
      handleError(err, this)
    } finally {
      currentOwner = prevOwner
      currentListener = prevListener
    }
  }

  override dispose(fromParent = false) {
    if (this.disposed) return
    super.dispose(fromParent)
    unlinkSources(this)
  }
}

/** A readable reactive value: tracking, `peek`, `onUpdate` and change notification. */
export abstract class Signal<T> {
  /** @internal */ _value!: T
  /** @internal */ _observers: Set<Listener> | null = null
  /** @internal */ _listeners: Set<UpdateListener<T>> | null = null
  /** @internal */ _equals: Equals<T>

  constructor(equals: Equals<T> = Object.is) {
    this._equals = equals
  }

  /** @internal Register this signal as a dependency of the running computation/derived. */
  _track() {
    const l = currentListener
    if (l && !l.disposed && (l as unknown) !== this) {
      const obs = (this._observers ??= new Set())
      if (!obs.has(l)) {
        obs.add(l)
        l.sources.push(this)
      }
    }
  }

  /** Read the value and track it in the running computation. */
  get(): T {
    this._track()
    return this._value
  }

  /** Read the value without tracking it. */
  peek(): T {
    return this._value
  }

  /** @internal Tell listeners (synchronously) and observers (batched) about a change. */
  _notify(old: T, next: T) {
    if (this._listeners) for (const fn of [...this._listeners]) fn(old, next)
    if (this._observers) for (const o of [...this._observers]) o.notify()
  }

  /**
   * Run `fn(old, next)` synchronously on every real change. Removed automatically when the
   * enclosing component (or computation) is destroyed. Returns an unsubscribe function.
   */
  onUpdate(fn: UpdateListener<T>): () => void {
    const listeners = (this._listeners ??= new Set())
    // Wrap so the same function can be registered twice and removed independently.
    const entry: UpdateListener<T> = (o, n) => fn(o, n)
    listeners.add(entry)
    const off = () => {
      listeners.delete(entry)
    }
    if (currentOwner) onCleanup(off)
    return off
  }
}

export interface DerivedOptions<T> {
  /** Downstream code re-runs only when this says the value changed (default `Object.is`). */
  equals?: Equals<T>
}

/**
 * A computed signal. Its value is always up to date when read, even synchronously right after a
 * write, and it only recomputes when something it read has changed.
 */
export class Derived<T> extends Signal<T> implements Listener {
  sources: Signal<any>[] = []
  disposed = false
  /** @internal */ _fn: () => T
  /** @internal */ _dirty = true
  /** @internal */ _initialized = false
  /** @internal */ _computing = false
  /** @internal */ _queued = false

  constructor(fn: () => T, options: DerivedOptions<T> = {}) {
    super(options.equals)
    this._fn = fn
    if (currentOwner) onCleanup(() => this.dispose())
  }

  /** @internal The error thrown by the last computation, rethrown to readers until it succeeds. */
  _error: { value: unknown } | null = null

  override get(): T {
    this._refresh()
    this._track()
    if (this._error) throw this._error.value
    return this._value
  }

  override peek(): T {
    this._refresh()
    if (this._error) throw this._error.value
    return this._value
  }

  /** A source changed: the value may be stale. */
  notify() {
    if (this._dirty || this.disposed) return
    this._dirty = true
    // `onUpdate` must fire synchronously, so recompute right away when someone listens.
    if (this._listeners?.size) return this._refresh()
    if (!this._observers?.size) return
    // Deriveds downstream may be stale too; computations only re-run once we know we changed.
    for (const o of [...this._observers]) if (o instanceof Derived) o.notify()
    enqueueDerived(this)
  }

  /** @internal Recompute if stale; notify observers when the value really changed. */
  _refresh() {
    if (!this._dirty || this.disposed) return
    if (this._computing) throw new Error('[lux] derived() depends on itself')
    this._computing = true
    unlinkSources(this)
    const prev = currentListener
    currentListener = this
    let next: T
    try {
      next = this._fn()
    } catch (err) {
      // Keep the error for readers; clearing `_dirty` lets the next source change notify again.
      this._dirty = false
      this._error = { value: err }
      if (this._observers) for (const o of [...this._observers]) o.notify()
      return
    } finally {
      currentListener = prev
      this._computing = false
    }
    this._dirty = false
    const old = this._value
    const recovered = this._error !== null
    this._error = null
    if (!this._initialized) {
      this._initialized = true
      this._value = next
      return
    }
    if (!recovered && this._equals(old, next)) return
    this._value = next
    if (recovered) {
      if (this._observers) for (const o of [...this._observers]) o.notify()
    } else this._notify(old, next)
  }

  dispose() {
    this.disposed = true
    unlinkSources(this)
  }
}

/** Create a computed signal: `const total = derived(() => price * qty)`. */
export function derived<T>(fn: () => T, options?: DerivedOptions<T>): Derived<T> {
  return new Derived(fn, options)
}

export function isSignal(v: unknown): v is Signal<unknown> {
  return v instanceof Signal
}

// ---------------------------------------------------------------------------
// Owner / tracking context

export function getOwner(): Owner | null {
  return currentOwner
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prev = currentOwner
  currentOwner = owner
  try {
    return fn()
  } finally {
    currentOwner = prev
  }
}

export function untrack<T>(fn: () => T): T {
  const prev = currentListener
  currentListener = null
  try {
    return fn()
  } finally {
    currentListener = prev
  }
}

/** Register a cleanup on the given owner (defaults to the current one). */
export function onCleanup(fn: Cleanup, owner: Owner | null = currentOwner) {
  if (owner) (owner.cleanups ??= []).push(fn)
}

/** Create a computation owned by the current owner and run it synchronously once. */
export function createComputation(fn: () => void, kind: ComputationKind = 'render'): Computation {
  const c = new Computation(fn, kind)
  c.run()
  return c
}

/** An accessor for a derived value (used by compiled conditionals). */
export function memo<T>(fn: () => T, equals?: Equals<T>): () => T {
  const d = new Derived(fn, { equals })
  return () => d.get()
}

// ---------------------------------------------------------------------------
// Scheduler

const derivedQueue: Derived<any>[] = []
const renderQueue: Computation[] = []
const userQueue: Computation[] = []
const mountQueue: (() => void)[] = []
let scheduled = false
let flushing = false

const MAX_STEPS = 1_000_000

function enqueue(c: Computation) {
  if (c.queued || c.disposed) return
  c.queued = true
  ;(c.kind === 'render' ? renderQueue : userQueue).push(c)
  schedule()
}

function enqueueDerived(d: Derived<any>) {
  if (d._queued) return
  d._queued = true
  derivedQueue.push(d)
  schedule()
}

/** Queue a job to run after pending render computations, before user computations. */
export function queueMount(fn: () => void) {
  mountQueue.push(fn)
  schedule()
}

function schedule() {
  if (scheduled || flushing) return
  scheduled = true
  queueMicrotask(flush)
}

function hasWork() {
  return derivedQueue.length + renderQueue.length + mountQueue.length + userQueue.length > 0
}

/**
 * Run all pending work synchronously: stale deriveds, then DOM (render) computations, then mount
 * jobs, then user `update` computations, repeating until nothing is left.
 */
export function flush() {
  if (flushing) return
  scheduled = false
  flushing = true
  let steps = 0
  try {
    while (true) {
      if (++steps > MAX_STEPS) {
        for (const q of [renderQueue, userQueue]) for (const c of q.splice(0)) c.queued = false
        for (const d of derivedQueue.splice(0)) d._queued = false
        mountQueue.length = 0
        throw new Error('[lux] update loop limit exceeded: a computation keeps changing state it depends on')
      }
      const d = derivedQueue.shift()
      if (d) {
        d._queued = false
        d._refresh()
        continue
      }
      const c = renderQueue.shift()
      if (c) {
        c.queued = false
        c.run()
        continue
      }
      const job = mountQueue.shift()
      if (job) {
        job()
        continue
      }
      const u = userQueue.shift()
      if (u) {
        u.queued = false
        u.run()
        continue
      }
      break
    }
  } finally {
    flushing = false
    if (hasWork()) schedule()
  }
}

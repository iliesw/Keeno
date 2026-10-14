// Core reactive graph: owners, computations, signals (base of State and Derived) and the scheduler.
import { devHook, warn } from './dev'

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
const INSTANCE = Symbol.for('keeno.runtime')
if ((globalThis as any)[INSTANCE]) {
  console.warn(
    '[keeno] two copies of @inflector/keeno are loaded. Components and the functions that render them ' +
      '(mount, renderToString) must come from the same copy: with Vite SSR, import renderToString ' +
      'in a module loaded through ssrLoadModule, not directly in Node.',
  )
} else (globalThis as any)[INSTANCE] = true

/** A node in the ownership tree. Disposing an owner disposes its children, then runs its cleanups. */
export class Owner {
  parent: Owner | null
  /** A set (in creation order), so a row of a long list disposes itself in O(1). */
  children: Set<Owner> | null = null
  cleanups: Cleanup[] | null = null
  disposed = false
  /** Values provided to descendants with `provide()`, keyed by context id. */
  context: Map<symbol, unknown> | null = null
  /** Handles errors thrown by descendants (see `handleError`). Rethrow to pass them further up. */
  onError: ((error: unknown) => void) | null = null

  constructor(parent: Owner | null = currentOwner) {
    this.parent = parent
    if (parent) (parent.children ??= new Set()).add(this)
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
    if (!fromParent) this.parent?.children?.delete(this)
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
  if (!(error instanceof NotReady)) devHook?.error(error, owner)
  for (let o = owner; o; o = o.parent) {
    if (!o.onError || o.disposed) continue
    try {
      o.onError(error)
      return
    } catch (err) {
      error = err
    }
  }
  // An async value read outside <Loading>: that region renders nothing until it resolves (the
  // computation that read it is tracked on it, so it re-runs then).
  if (error instanceof NotReady) {
    warn('an async derived was read outside <Loading>: wrap the content that reads it in <Loading fallback={…}>')
    return
  }
  if (typeof error === 'object' && error !== null) unhandled.add(error)
  throw error
}

/**
 * Thrown by reading an async derived that has no value yet. `<Loading>` catches it and shows its
 * fallback until the derived settles.
 */
export class NotReady {
  constructor(readonly derived: Derived<any>) {}
}

function runCleanup(fn: Cleanup) {
  try {
    fn()
  } catch (err) {
    console.error('[keeno] error in cleanup:', err)
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
    devHook?.run(this)
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
  /** @internal Variable name, set by `.kn` compiled in development mode (for the dev tools). */
  declare _name?: string

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
    // A throwing listener must not keep observers stale: notify them first, then rethrow.
    let error: { value: unknown } | null = null
    if (this._listeners) {
      for (const fn of [...this._listeners]) {
        try {
          fn(old, next)
        } catch (err) {
          error ??= { value: err }
        }
      }
    }
    if (this._observers) for (const o of [...this._observers]) o.notify()
    if (error) throw error.value
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
  /** Async deriveds: the id its server-rendered value is sent under (default: creation order). */
  key?: string
  /** Async deriveds: don't send the server-rendered value to the client (it fetches again). */
  ssr?: boolean
}

/** What an async derived's function receives. */
export interface AsyncContext {
  /** Aborted when a newer run starts or the derived is disposed: pass it to `fetch`. */
  readonly signal: AbortSignal
}

/** A minimal writable signal, for internal flags (State lives in state.ts, which imports this file). */
export class Cell<T> extends Signal<T> {
  constructor(value: T) {
    super()
    this._value = value
  }
  set(value: T) {
    const old = this._value
    if (Object.is(old, value)) return
    this._value = value
    this._notify(old, value)
  }
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (typeof v === 'object' || typeof v === 'function') && v !== null && typeof (v as any).then === 'function'
}

/** Something `pending()` can report on: an async derived, or a state with a `save` in flight. */
interface Loadable {
  _loading: Cell<boolean> | null
}

/** Async deriveds and saving states read by the running `pending()` call. */
let pendingReads: Loadable[] | null = null

/** @internal Report a read to the running `pending()` call, if any. */
export function notePendingRead(s: Loadable) {
  if (pendingReads) pendingReads.push(s)
}

/**
 * Server rendering and hydration: where async deriveds report themselves (to be awaited and
 * serialized) and find values the server sent.
 * @internal
 */
export interface AsyncRegistry {
  /** Next id for an async derived without a `key`. */
  next: number
  /** Put before generated ids, so separately hydrated parts (islands) don't share them. */
  prefix?: string
  /** The value the server sent under `id`, if any (hydration). */
  peek(id: string): { value: unknown } | undefined
  /** Called when a derived turns out to be async (its `_ssrId` is set). */
  created(d: Derived<any>): void
  /** Streaming server render: a `<Loading>` was created (see renderToStream). */
  boundary?(b: LoadingBoundary): void
}

/** @internal What renderToStream needs to know about a `<Loading>`. */
export interface LoadingBoundary {
  /** Number of async deriveds it waits for (reactive). */
  waiting(): number
  /** Its children's nodes (rendered even while the fallback shows). */
  content(): Node[]
  /** The closest enclosing boundary. */
  parent: LoadingBoundary | null
  /** Set by the stream: the id used in its markers. */
  id?: number
}

/** @internal The registry of the render the current owner belongs to. */
export function currentRegistry(): AsyncRegistry | null {
  return findRegistry(currentOwner)
}

/** Key of the registry in a root owner's `context` (per render, so concurrent server renders stay apart). */
const REGISTRY = Symbol('keeno.async')
/** Number of installed registries: while it is 0, deriveds skip looking for one. */
let registries = 0

/** @internal Install `r` on the root owner of a render or hydration. Returns a function that removes it. */
export function installAsyncRegistry(root: Owner, r: AsyncRegistry): () => void {
  ;(root.context ??= new Map()).set(REGISTRY, r)
  registries++
  let removed = false
  return () => {
    if (removed) return
    removed = true
    root.context?.delete(REGISTRY)
    registries--
  }
}

function findRegistry(owner: Owner | null): AsyncRegistry | null {
  if (!registries) return null
  for (let o = owner; o; o = o.parent) {
    const r = o.context?.get(REGISTRY)
    if (r) return r as AsyncRegistry
  }
  return null
}

/**
 * A computed signal. Its value is always up to date when read, even synchronously right after a
 * write, and it only recomputes when something it read has changed.
 *
 * When the function returns a promise, the derived is async: reading it before the first value
 * throws `NotReady` (caught by `<Loading>`), later re-runs keep the previous value until the new
 * one arrives, and results of runs that were superseded are ignored.
 */
export class Derived<T> extends Signal<T> implements Listener {
  sources: Signal<any>[] = []
  disposed = false
  /** @internal */ _fn: (ctx?: AsyncContext) => T
  /** @internal */ _dirty = true
  /** @internal */ _initialized = false
  /** @internal */ _computing = false
  /** @internal */ _queued = false
  /** @internal True once the function returned a promise. */
  _async = false
  /** @internal Async: whether a value arrived (before that, reads throw NotReady). */
  _hasValue = false
  /** @internal Async: true while a run is in flight (reactive, for `pending()`). */
  _loading: Cell<boolean> | null = null
  /** @internal Async: the id of the current run; results of older runs are ignored. */
  _version = 0
  /** @internal Async: aborts the current run. */
  _abort: AbortController | null = null
  /** @internal Async: resolved when the current run settles (see `_settled`). */
  _settle: { promise: Promise<void>; resolve: () => void } | null = null
  /** @internal Async: the thrown NotReady (one per derived). */
  _notReady: NotReady | null = null
  /** @internal Async: server rendering id and options. */
  _ssrId: string | null = null
  _ssr: boolean
  _key: string | undefined
  /** @internal Where it was created: the owner chain leads to the render's registry. */
  _owner: Owner | null = currentOwner

  constructor(fn: (ctx?: AsyncContext) => T, options: DerivedOptions<T> = {}) {
    super(options.equals)
    this._fn = fn
    this._key = options.key
    this._ssr = options.ssr !== false
    if (currentOwner) onCleanup(() => this.dispose())
  }

  /** @internal The error thrown by the last computation, rethrown to readers until it succeeds. */
  _error: { value: unknown } | null = null

  override get(): T {
    this._refresh()
    this._track()
    if (this._async) {
      if (pendingReads) pendingReads.push(this)
      if (!this._hasValue && !this._error) throw (this._notReady ??= new NotReady(this))
    }
    if (this._error) throw this._error.value
    return this._value
  }

  override peek(): T {
    this._refresh()
    if (this._async && !this._hasValue && !this._error) throw (this._notReady ??= new NotReady(this))
    if (this._error) throw this._error.value
    return this._value
  }

  /** Run the function again now (for an async derived: fetch again, keeping the current value meanwhile). */
  refresh(): void {
    if (this.disposed) return
    this._dirty = true
    this._refresh()
  }

  /** @internal Resolves once no run is in flight (immediately if none is). */
  _settled(): Promise<void> {
    if (!this._loading?.peek()) return Promise.resolve()
    if (!this._settle) {
      let resolve!: () => void
      const promise = new Promise<void>((r) => (resolve = r))
      this._settle = { promise, resolve }
    }
    return this._settle.promise
  }

  /** @internal The function returned a promise: wait for it (run `version`). */
  _startAsync(p: PromiseLike<T>, version: number, seeded?: { value: unknown }) {
    if (!this._async) {
      this._async = true
      this._loading = new Cell(false)
      const r = findRegistry(this._owner)
      if (r) {
        this._ssrId = this._key ?? `${r.prefix ?? ''}k${r.next++}`
        r.created(this)
      }
      // A value the server sent: start with it instead of waiting.
      if (seeded) {
        this._resolveAsync(seeded.value as T, version)
        return
      }
    }
    this._loading!.set(true)
    p.then(
      (value) => this._resolveAsync(value, version),
      (error) => this._rejectAsync(error, version),
    )
  }

  /** @internal */
  _resolveAsync(value: T, version: number) {
    if (version !== this._version || this.disposed) return
    const old = this._value
    const first = !this._hasValue
    const recovered = this._error !== null
    this._hasValue = true
    this._error = null
    this._value = value
    this._finishRun()
    if (first || recovered) {
      if (this._observers) for (const o of [...this._observers]) o.notify()
      if (first && !recovered && this._listeners) this._notify(old, value)
    } else if (!this._equals(old, value)) this._notify(old, value)
  }

  /** @internal */
  _rejectAsync(error: unknown, version: number) {
    if (version !== this._version || this.disposed) return
    // It read another async derived that isn't ready: it re-runs when that one settles.
    if (error instanceof NotReady) return
    this._error = { value: error }
    this._finishRun()
    if (this._observers) for (const o of [...this._observers]) o.notify()
  }

  /** @internal A run settled: no longer loading. */
  _finishRun() {
    this._abort = null
    this._loading!.set(false)
    const s = this._settle
    this._settle = null
    s?.resolve()
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
    if (this._computing) throw new Error('[keeno] derived() depends on itself')
    this._computing = true
    unlinkSources(this)
    const prev = currentListener
    currentListener = this
    // A value the server sent for this async derived (hydration): run the function only to track
    // what it reads, with an aborted signal so a `fetch` given it never reaches the network.
    const r = findRegistry(this._owner)
    let seeded: { value: unknown } | undefined
    if (r && !this._async && !this._initialized) seeded = r.peek(this._key ?? `${r.prefix ?? ''}k${r.next}`)
    let controller: AbortController | null = null
    let next: T
    try {
      if (this._fn.length > 0) {
        controller = new AbortController()
        if (seeded) controller.abort()
        next = this._fn({ signal: controller.signal })
      } else next = this._fn()
    } catch (err) {
      // Keep the error for readers; clearing `_dirty` lets the next source change notify again.
      this._dirty = false
      this._error = { value: err }
      if (this._async) {
        // A run still in flight is superseded by this failure.
        this._version++
        this._abort?.abort()
        this._finishRun()
      }
      if (this._observers) for (const o of [...this._observers]) o.notify()
      return
    } finally {
      currentListener = prev
      this._computing = false
    }
    this._dirty = false
    if (this._async || isThenable(next)) {
      if (!isThenable(next)) next = Promise.resolve(next) as T
      const version = ++this._version
      this._abort?.abort()
      this._abort = controller
      this._initialized = true
      // A new run replaces a failed one: readers wait for it (or keep the last good value).
      if (this._error) {
        this._error = null
        if (this._observers) for (const o of [...this._observers]) o.notify()
      }
      if (seeded) (next as PromiseLike<T>).then(undefined, () => {}) // the ignored run must not report
      this._startAsync(next as PromiseLike<T>, version, seeded)
      return
    }
    const old = this._value
    const recovered = this._error !== null
    this._error = null
    if (!this._initialized) {
      this._initialized = true
      this._value = next
      // Readers saw the error of a failed first run: tell them it now has a value.
      if (recovered && this._observers) for (const o of [...this._observers]) o.notify()
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
    if (this._async) {
      this._abort?.abort()
      this._abort = null
      const s = this._settle
      this._settle = null
      s?.resolve()
    }
  }
}

/**
 * Create a computed signal: `const total = derived(() => price * qty)`. An async function makes
 * an async derived, read inside `<Loading>`: `const user = derived(async () => (await fetch(url)).json())`.
 */
export function derived<T>(fn: (ctx: AsyncContext) => Promise<T>, options?: DerivedOptions<T>): Derived<T>
export function derived<T>(fn: () => T, options?: DerivedOptions<T>): Derived<T>
export function derived(fn: (ctx: AsyncContext) => unknown, options?: DerivedOptions<any>): Derived<any> {
  const d = new Derived(fn as (ctx?: AsyncContext) => unknown, options)
  devHook?.signal(d)
  return d
}

/**
 * True while an async derived read by `fn` is loading, including a re-run that keeps showing the
 * previous value, or while a state read by `fn` has a `save` in flight:
 * `{pending(() => user) && <small>refreshing…</small>}`. Reactive.
 */
export function pending(fn: () => unknown): boolean {
  const prev = pendingReads
  const reads: Loadable[] = (pendingReads = [])
  let notReady = false
  try {
    fn()
  } catch (err) {
    // A failed value isn't pending: errors are for whoever renders the value.
    notReady = err instanceof NotReady
  } finally {
    pendingReads = prev
  }
  let loading = notReady
  for (const d of reads) if (d._loading?.get()) loading = true
  return loading
}

/** Name a state or derived for the dev tools (emitted by the compiler in development mode). */
export function label<S>(s: S, name: string): S {
  if (s instanceof Signal) s._name ??= name
  return s
}

export function isSignal(v: unknown): v is Signal<unknown> {
  return v instanceof Signal
}

// ---------------------------------------------------------------------------
// Owner / tracking context

export function getOwner(): Owner | null {
  return currentOwner
}

/** @internal True while a computation or derived is recording what it reads. */
export function isTracking(): boolean {
  return currentListener !== null && !currentListener.disposed
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

/** A FIFO queue with O(1) `shift` (an array's `shift` is O(n), which makes big flushes quadratic). */
class Queue<T> {
  items: T[] = []
  head = 0
  get length() {
    return this.items.length - this.head
  }
  push(item: T) {
    this.items.push(item)
  }
  unshift(item: T) {
    if (this.head > 0) this.items[--this.head] = item
    else this.items.unshift(item)
  }
  shift(): T | undefined {
    if (this.head >= this.items.length) return undefined
    const item = this.items[this.head]
    this.items[this.head++] = undefined as T
    if (this.head === this.items.length) {
      this.items.length = 0
      this.head = 0
    } else if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }
    return item
  }
  /** Remove and return everything. */
  drain(): T[] {
    const rest = this.items.slice(this.head)
    this.items = []
    this.head = 0
    return rest
  }
}

const derivedQueue = new Queue<Derived<any>>()
const renderQueue = new Queue<Computation>()
const userQueue = new Queue<Computation>()
const mountQueue = new Queue<() => void>()
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

/**
 * Queue a job to run after pending render computations, before user computations. With `first`,
 * it runs before the mount jobs already queued.
 */
export function queueMount(fn: () => void, first = false) {
  if (first) mountQueue.unshift(fn)
  else mountQueue.push(fn)
  schedule()
}

function schedule() {
  if (scheduled || flushing) return
  scheduled = true
  queueMicrotask(flush)
}

/**
 * Run `c`, but first its queued ancestors (outermost first): re-running a parent can dispose `c`,
 * for example when the condition it renders under turned false, and `c` must not run on stale data.
 */
function runQueued(c: Computation) {
  const chain = [c]
  for (let o = c.parent; o; o = o.parent) if (o instanceof Computation && o.queued) chain.push(o)
  for (let i = chain.length - 1; i >= 0; i--) {
    chain[i]!.queued = false
    chain[i]!.run()
  }
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
  const start = devHook ? performance.now() : 0
  let steps = 0
  try {
    while (true) {
      if (++steps > MAX_STEPS) {
        for (const q of [renderQueue, userQueue]) for (const c of q.drain()) c.queued = false
        for (const d of derivedQueue.drain()) d._queued = false
        mountQueue.drain()
        throw new Error('[keeno] update loop limit exceeded: a computation keeps changing state it depends on')
      }
      const d = derivedQueue.shift()
      if (d) {
        d._queued = false
        d._refresh()
        continue
      }
      const c = renderQueue.shift()
      if (c) {
        // Not queued any more: it already ran early, as an ancestor of another computation.
        if (c.queued) runQueued(c)
        continue
      }
      const job = mountQueue.shift()
      if (job) {
        job()
        continue
      }
      const u = userQueue.shift()
      if (u) {
        if (u.queued) runQueued(u)
        continue
      }
      break
    }
  } finally {
    flushing = false
    if (hasWork()) schedule()
    if (devHook && steps > 1) devHook.flush(performance.now() - start)
  }
}

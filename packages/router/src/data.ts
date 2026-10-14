// Data for Keeno apps: query() (a keyed cache), invalidate() and action() (mutations that revalidate).
import { State } from '@inflector/keeno'

/** A cache key: a string, or an array of JSON values whose first items group it (`['users', id]`). */
export type QueryKey = string | readonly unknown[]

export interface QueryOptions {
  /**
   * How long a result is reused, in ms (default 0: only a request still in flight is shared). A
   * result that `prefetch()` loaded is reused once by the next read within 30 s whatever this is.
   */
  staleTime?: number
}

/** What a query's function receives. */
export interface QueryContext {
  /** Aborted when the key is invalidated while the request is in flight: pass it to `fetch`. */
  readonly signal: AbortSignal
}

interface Entry {
  promise: Promise<unknown>
  /** When the result arrived (0 while in flight). */
  at: number
  ctrl: AbortController
  /** Loaded by a prefetch and not read since. */
  prefetched: boolean
}

/** How long a prefetched result waits for the navigation that uses it. */
const PREFETCH_TTL = 30_000
/** Results not read for this long are dropped. */
const GC_TIME = 5 * 60_000

const entries = new Map<string, Entry>()
/** One version per key, bumped by invalidate(): reading it makes a derived re-run on invalidation. */
const versions = new Map<string, State<number>>()
/** Bumped when everything is invalidated. */
const all = new State(0)

const hasWindow = typeof window !== 'undefined'

function parts(key: QueryKey): readonly unknown[] {
  return typeof key === 'string' ? [key] : key
}

function hash(key: QueryKey): string {
  return JSON.stringify(parts(key))
}

function version(id: string): State<number> {
  let v = versions.get(id)
  if (!v) versions.set(id, (v = new State(0)))
  return v
}

/**
 * @internal Make the running derived re-run when `key` is invalidated. Returns a string that
 * changes with the key and each invalidation of it.
 */
export function trackQuery(key: QueryKey): string {
  const id = hash(key)
  return `${all.get()}:${version(id).get()}:${id}`
}

function collect(id: string, e: Entry) {
  setTimeout(() => {
    if (entries.get(id) !== e) return
    if (Date.now() - e.at >= GC_TIME) entries.delete(id)
    else collect(id, e)
  }, GC_TIME)
}

function start<T>(id: string, fn: (ctx: QueryContext) => Promise<T> | T, prefetched: boolean): Promise<T> {
  const ctrl = new AbortController()
  const e: Entry = { promise: undefined!, at: 0, ctrl, prefetched }
  e.promise = Promise.resolve()
    .then(() => fn({ signal: ctrl.signal }))
    .then(
      (value) => {
        if (entries.get(id) === e) {
          e.at = Date.now()
          collect(id, e)
        }
        return value
      },
      (error) => {
        // Failures aren't cached: the next read tries again.
        if (entries.get(id) === e) entries.delete(id)
        throw error
      },
    )
  entries.set(id, e)
  return e.promise as Promise<T>
}

/**
 * Load `key` with `fn`, sharing the request with other reads of the same key while it is in flight
 * (and reusing its result for `staleTime` ms). Call it in an async `derived`, before any `await`,
 * and the derived runs again when the key is invalidated:
 *
 * `const user = derived(() => query(['users', id], () => fetch(`/api/users/${id}`).then((r) => r.json())))`
 *
 * On the server nothing is cached: every call runs `fn`, so requests never share data.
 */
export function query<T>(key: QueryKey, fn: (ctx: QueryContext) => Promise<T> | T, options: QueryOptions = {}): Promise<T> {
  trackQuery(key)
  if (!hasWindow) return Promise.resolve().then(() => fn({ signal: new AbortController().signal }))
  const id = hash(key)
  const e = entries.get(id)
  if (e) {
    if (!e.at) return e.promise as Promise<T>
    const age = Date.now() - e.at
    if (e.prefetched && age < PREFETCH_TTL) {
      e.prefetched = false
      return e.promise as Promise<T>
    }
    if (age < (options.staleTime ?? 0)) return e.promise as Promise<T>
  }
  return start(id, fn, false)
}

/** @internal Load `key` ahead of a navigation, unless it is in flight or already prefetched. */
export function prefetchQuery<T>(key: QueryKey, fn: (ctx: QueryContext) => Promise<T> | T): Promise<unknown> {
  if (!hasWindow) return Promise.resolve()
  const id = hash(key)
  const e = entries.get(id)
  if (e && (!e.at || (e.prefetched && Date.now() - e.at < PREFETCH_TTL))) return e.promise.catch(() => {})
  return start(id, fn, true).catch(() => {})
}

function matches(prefix: readonly unknown[], key: readonly unknown[]): boolean {
  if (prefix.length > key.length) return false
  return prefix.every((p, i) => JSON.stringify(p) === JSON.stringify(key[i]))
}

/**
 * Mark cached results stale and re-run the deriveds that read them: every key, the keys starting
 * with the items of `key` (`invalidate(['users'])` covers `['users', 1]`), or the keys `key` accepts.
 */
export function invalidate(key?: QueryKey | ((key: readonly unknown[]) => boolean)): void {
  const test =
    key === undefined ? () => true : typeof key === 'function' ? key : (k: readonly unknown[]) => matches(parts(key), k)
  for (const [id, e] of [...entries]) {
    if (!test(JSON.parse(id))) continue
    entries.delete(id)
    e.ctrl.abort()
  }
  if (key === undefined) all.set(all.peek() + 1)
  else for (const [id, v] of versions) if (test(JSON.parse(id))) v.set(v.peek() + 1)
}

export interface ActionOptions {
  /**
   * What to invalidate after the action succeeds (default `true`: everything, so the route data
   * and queries on screen load again). `false` invalidates nothing; keys invalidate those keys.
   */
  invalidate?: boolean | QueryKey[]
}

/** A mutation: call it, or use `submit` as a form's `onSubmit`. Its fields are reactive. */
export interface Action<A extends unknown[], R> {
  (...args: A): Promise<R>
  /** True while a call is in flight. */
  readonly pending: boolean
  /** What the last call threw, or undefined. */
  readonly error: unknown
  /** What the last successful call returned. */
  readonly result: R | undefined
  /** `<form onSubmit={save.submit}>`: calls the action with the form's `FormData`. Errors stay in `error`. */
  readonly submit: (e: SubmitEvent) => void
  /** Clear `error` and `result`. */
  reset(): void
}

/**
 * Wrap a mutation: `const save = action(async (data: FormData) => { … })`. While it runs,
 * `save.pending` is true; afterwards `save.result` or `save.error` holds the outcome, and the
 * cached queries (including route data) are invalidated, so what's on screen loads again.
 */
export function action<A extends unknown[], R>(fn: (...args: A) => Promise<R> | R, options: ActionOptions = {}): Action<A, R> {
  const running = new State(0)
  const outcome = new State<{ error?: unknown; result?: R }>({})
  let latest = 0

  const run = (async (...args: A) => {
    const id = ++latest
    running.set(running.peek() + 1)
    try {
      const result = await fn(...args)
      if (id === latest) outcome.set({ result })
      const inv = options.invalidate ?? true
      if (inv === true) invalidate()
      else if (inv) for (const k of inv) invalidate(k)
      return result
    } catch (error) {
      if (id === latest) outcome.set({ error })
      throw error
    } finally {
      running.set(running.peek() - 1)
    }
  }) as Action<A, R>

  Object.defineProperties(run, {
    pending: { get: () => running.get() > 0 },
    error: { get: () => outcome.get().error },
    result: { get: () => outcome.get().result },
  })
  ;(run as { submit: unknown }).submit = (e: SubmitEvent) => {
    e.preventDefault()
    const form = e.currentTarget as HTMLFormElement
    ;(run as unknown as (data: FormData) => Promise<R>)(new FormData(form, e.submitter)).catch(() => {})
  }
  run.reset = () => outcome.set({})
  return run
}

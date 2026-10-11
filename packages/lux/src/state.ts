// Writable state and its options: equals, validate, history, persist, url, debounce / throttle.
import { Signal, getOwner, onCleanup, type Equals } from './signal'

export interface UrlOptions {
  /** Query parameter name. */
  param: string
  /** Use `history.replaceState` instead of adding a history entry per change (default false). */
  replace?: boolean
}

export interface StateOptions<T> {
  /** Writes equal to the current value are ignored (default `Object.is`). See `deepEqual`. */
  equals?: Equals<T>
  /** Runs on every write (and on values loaded from storage or the URL). Return the value to store; return `prev` to reject. */
  validate?: (next: T, prev: T) => T
  /** Save to `localStorage` under this key, and sync across tabs with BroadcastChannel. */
  persist?: string
  /** Two-way sync with a query parameter; back and forward restore earlier values. */
  url?: string | UrlOptions
  /** Keep this many past values for `undo()` / `redo()`. */
  history?: number
  /** Delay writes until no write happened for this many ms. */
  debounce?: number
  /** Apply at most one write per this many ms (first and last write win). */
  throttle?: number
}

/** Where a write came from; decides which side effects run. */
type Source = 'local' | 'remote' | 'url' | 'history'

interface History<T> {
  limit: number
  past: T[]
  future: T[]
  version: State<number>
}

export class State<T> extends Signal<T> {
  /** @internal */ _validate?: (next: T, prev: T) => T
  /** @internal */ _history?: History<T>
  /** @internal */ _persistKey?: string
  /** @internal */ _channel?: BroadcastChannel
  /** @internal */ _url?: { param: string; replace: boolean; default: T }
  /** @internal */ _schedule?: (value: T) => void
  /** @internal */ _pending = false

  constructor(value: T, options: StateOptions<T> = {}) {
    super(options.equals)
    this._validate = options.validate
    this._value = this._validate ? this._validate(value, value) : value
    if (options.history) {
      this._history = { limit: options.history, past: [], future: [], version: new State(0) }
    }
    if (options.debounce != null && options.throttle != null) {
      throw new Error('[lux] state(): use either debounce or throttle, not both')
    }
    if (options.debounce != null) this._schedule = debounced(this, options.debounce)
    if (options.throttle != null) this._schedule = throttled(this, options.throttle)
    if (options.persist) setupPersist(this, options.persist)
    if (options.url) setupUrl(this, typeof options.url === 'string' ? { param: options.url } : options.url)
  }

  /** Write the value. Ignored if equal to the current value (see `equals`). */
  set(value: T): void {
    if (this._schedule) this._schedule(value)
    else this._write(value, 'local')
  }

  /** @internal Apply a write now. Returns true if the value changed. */
  _write(value: T, source: Source): boolean {
    if (this._validate) value = this._validate(value, this._value)
    const old = this._value
    if (this._equals(old, value)) return false
    const h = this._history
    if (h && source === 'local') {
      h.past.push(old)
      if (h.past.length > h.limit) h.past.shift()
      h.future = []
      h.version.set(h.version.peek() + 1)
    }
    this._value = value
    this._notify(old, value)
    if (this._persistKey && source !== 'remote') savePersisted(this)
    if (this._url && source !== 'url') scheduleUrlWrite(this)
    return true
  }

  /** @internal True while a debounced/throttled write is waiting. */
  _isPending() {
    return this._pending
  }

  /** Go back to the previous value (needs the `history` option). */
  undo(): void {
    const h = this._history
    if (!h?.past.length) return
    const prev = h.past.pop()!
    h.future.push(this._value)
    h.version.set(h.version.peek() + 1)
    this._write(prev, 'history')
  }

  /** Re-apply a value removed by `undo()` (needs the `history` option). */
  redo(): void {
    const h = this._history
    if (!h?.future.length) return
    const next = h.future.pop()!
    h.past.push(this._value)
    h.version.set(h.version.peek() + 1)
    this._write(next, 'history')
  }

  /** Whether `undo()` would do something (reactive). */
  get canUndo(): boolean {
    const h = this._history
    if (!h) return false
    h.version.get()
    return h.past.length > 0
  }

  /** Whether `redo()` would do something (reactive). */
  get canRedo(): boolean {
    const h = this._history
    if (!h) return false
    h.version.get()
    return h.future.length > 0
  }
}

export function state<T>(value: T, options?: StateOptions<T>): State<T>
export function state<T = undefined>(): State<T | undefined>
export function state<T>(value?: T, options?: StateOptions<T | undefined>): State<T | undefined> {
  return new State(value, options)
}

export function isState(v: unknown): v is State<unknown> {
  return v instanceof State
}

/** Structural equality for primitives, arrays, plain objects and dates. Use as `{ equals: deepEqual }`. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]))
  }
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual((a as any)[k], (b as any)[k]))
}

// ---------------------------------------------------------------------------
// debounce / throttle

function debounced<T>(s: State<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  if (getOwner()) onCleanup(() => clearTimeout(timer))
  return (value: T) => {
    s._pending = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      s._pending = false
      s._write(value, 'local')
    }, ms)
  }
}

function throttled<T>(s: State<T>, ms: number) {
  let last = -Infinity
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest: T
  if (getOwner()) onCleanup(() => clearTimeout(timer))
  return (value: T) => {
    const now = Date.now()
    if (now - last >= ms && !timer) {
      last = now
      s._write(value, 'local')
      return
    }
    latest = value
    s._pending = true
    timer ??= setTimeout(
      () => {
        timer = undefined
        last = Date.now()
        s._pending = false
        s._write(latest, 'local')
      },
      ms - (now - last),
    )
  }
}

// ---------------------------------------------------------------------------
// persist: localStorage + BroadcastChannel

function setupPersist<T>(s: State<T>, key: string) {
  s._persistKey = key
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (raw != null) {
      const loaded = JSON.parse(raw) as T
      s._value = s._validate ? s._validate(loaded, s._value) : loaded
    }
  } catch {
    // unreadable or invalid JSON: keep the initial value
  }
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(`lux:persist:${key}`)
  channel.onmessage = (e: MessageEvent) => {
    try {
      s._write(e.data === undefined ? (undefined as T) : (JSON.parse(e.data) as T), 'remote')
    } catch {
      // ignore malformed messages
    }
  }
  s._channel = channel
  if (getOwner()) onCleanup(() => channel.close())
}

function savePersisted<T>(s: State<T>) {
  const key = s._persistKey!
  const json = s._value === undefined ? undefined : JSON.stringify(s._value)
  try {
    if (json === undefined) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, json)
  } catch {
    // storage full or unavailable
  }
  try {
    s._channel?.postMessage(json)
  } catch {
    // channel closed
  }
}

// ---------------------------------------------------------------------------
// url: query parameter sync

const urlStates = new Set<State<any>>()
const pendingUrl = new Set<State<any>>()
let urlFlushScheduled = false
let popstateBound = false

function parseParam<T>(raw: string, fallback: T): T {
  switch (typeof fallback) {
    case 'string':
      return raw as T
    case 'number': {
      const n = Number(raw)
      return (raw.trim() === '' || Number.isNaN(n) ? fallback : n) as T
    }
    case 'boolean':
      return (raw === '' || raw === 'true' || raw === '1') as T
    default:
      try {
        return JSON.parse(raw) as T
      } catch {
        return fallback
      }
  }
}

function serializeParam(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v)
}

function readUrl<T>(s: State<T>): T {
  const u = s._url!
  const raw = new URLSearchParams(location.search).get(u.param)
  if (raw == null) return u.default
  const v = parseParam(raw, u.default)
  return s._validate ? s._validate(v, u.default) : v
}

function setupUrl<T>(s: State<T>, opts: UrlOptions) {
  s._url = { param: opts.param, replace: !!opts.replace, default: s._value }
  if (typeof location === 'undefined') return
  s._value = readUrl(s)
  urlStates.add(s)
  if (getOwner()) onCleanup(() => urlStates.delete(s))
  if (!popstateBound) {
    popstateBound = true
    window.addEventListener('popstate', () => {
      for (const st of urlStates) st._write(readUrl(st), 'url')
    })
  }
}

/** Write all states changed in this tick to the URL as a single history entry. */
function scheduleUrlWrite(s: State<any>) {
  if (typeof location === 'undefined') return
  pendingUrl.add(s)
  if (urlFlushScheduled) return
  urlFlushScheduled = true
  queueMicrotask(() => {
    urlFlushScheduled = false
    const url = new URL(location.href)
    let push = false
    for (const st of pendingUrl) {
      const u = st._url!
      if (st._equals(st._value, u.default)) url.searchParams.delete(u.param)
      else url.searchParams.set(u.param, serializeParam(st._value))
      if (!u.replace) push = true
    }
    pendingUrl.clear()
    if (url.href === location.href) return
    if (push) history.pushState(history.state, '', url)
    else history.replaceState(history.state, '', url)
  })
}

// store(): deep reactive objects and arrays, updated by plain mutation and tracked per property.
import { Signal, isTracking } from './signal'

/** Notifies the readers of one property (or of an object's keys). Has no value of its own. */
class KeySignal extends Signal<undefined> {
  trigger() {
    this._notify(undefined, undefined)
  }
}

const RAW = Symbol('keeno.raw')
/** Pseudo-key for an object's set of keys (and an array's order): read by iteration and `ownKeys`. */
const KEYS = Symbol('keeno.keys')

const proxies = new WeakMap<object, object>()
const signals = new WeakMap<object, Map<PropertyKey, KeySignal>>()

/** Only plain objects and arrays become reactive; Dates, Maps, class instances… are kept as they are. */
function wrappable(v: unknown): v is object {
  if (typeof v !== 'object' || v === null) return false
  if (Array.isArray(v)) return true
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function track(target: object, key: PropertyKey) {
  if (!isTracking()) return
  let map = signals.get(target)
  if (!map) signals.set(target, (map = new Map()))
  let s = map.get(key)
  if (!s) map.set(key, (s = new KeySignal()))
  s._track()
}

function trigger(target: object, key: PropertyKey) {
  signals.get(target)?.get(key)?.trigger()
}

const isIndex = (key: PropertyKey) => typeof key === 'string' && String(Number(key) >>> 0) === key

/** The raw object behind a store proxy (or `v` itself). */
function raw<T>(v: T): T {
  return (typeof v === 'object' && v !== null && (v as any)[RAW]) || v
}

const handler: ProxyHandler<any> = {
  get(target, key, receiver) {
    if (key === RAW) return target
    const value = Reflect.get(target, key, receiver)
    if (typeof key === 'symbol') return value
    // Methods (array `push`, `map`…) aren't data: tracking happens on what they read.
    if (Object.hasOwn(target, key) || !(key in target)) track(target, key)
    return wrappable(value) ? wrap(value) : value
  },
  set(target, key, value) {
    value = raw(value)
    const isArray = Array.isArray(target)
    const had = Object.hasOwn(target, key)
    const old = target[key]
    const oldLength = isArray ? target.length : 0
    if (!Reflect.set(target, key, value)) return false
    if (had && Object.is(old, value)) return true
    trigger(target, key)
    if (isArray) {
      if (key === 'length') {
        for (let i = value; i < oldLength; i++) trigger(target, String(i))
      } else if (target.length !== oldLength) trigger(target, 'length')
      trigger(target, KEYS)
    } else if (!had) trigger(target, KEYS)
    return true
  },
  deleteProperty(target, key) {
    if (!Object.hasOwn(target, key)) return true
    delete target[key]
    trigger(target, key)
    trigger(target, KEYS)
    return true
  },
  has(target, key) {
    if (key === RAW) return true
    if (typeof key !== 'symbol') track(target, key)
    return Reflect.has(target, key)
  },
  ownKeys(target) {
    track(target, KEYS)
    return Reflect.ownKeys(target)
  },
}

function wrap<T extends object>(v: T): T {
  let p = proxies.get(v)
  if (!p) proxies.set(v, (p = new Proxy(v, handler)))
  return p as T
}

/**
 * A deep reactive object: read and mutate it like a plain object, and only the code that read a
 * property re-runs when it changes. `todos.items.push(todo)`, `todos.items[0].done = true`.
 * Nested plain objects and arrays are reactive too; other values (Dates, Maps…) are kept as is.
 */
export function store<T extends object>(value: T): T {
  if (!wrappable(value)) throw new Error('[keeno] store() takes a plain object or an array')
  return wrap(raw(value))
}

/** True for a store (or a nested object read from one). */
export function isStore(v: unknown): boolean {
  return typeof v === 'object' && v !== null && proxies.get((v as any)[RAW]) === v
}

/** @internal Track an array's (or object's) keys and order, for code that iterates it untracked. */
export function trackKeys(v: unknown): void {
  if (isStore(v)) track((v as any)[RAW], KEYS)
}

/**
 * A plain deep copy of a store's current data (for JSON, logging, sending to a server). It reads
 * the whole store, so a derived or template that uses it re-runs on any change inside.
 */
export function snapshot<T>(value: T): T {
  if (!isStore(value)) return wrappable(value) ? copy(value) : value
  // Read through the proxy, so every property is tracked.
  const v = value as any
  if (Array.isArray(raw(v))) return Array.from(v as unknown[], (item) => snapshot(item)) as T
  const out: Record<PropertyKey, unknown> = Object.create(Object.getPrototypeOf(raw(v)))
  for (const k of Object.keys(v)) out[k] = snapshot(v[k])
  return out as T
}

/** Deep copy of plain data that isn't a store (it may still hold store objects). */
function copy<T>(value: T): T {
  if (isStore(value)) return snapshot(value)
  if (!wrappable(value)) return value
  if (Array.isArray(value)) return value.map(copy) as T
  const out: Record<PropertyKey, unknown> = Object.create(Object.getPrototypeOf(value))
  for (const k of Object.keys(value)) out[k] = copy((value as any)[k])
  return out as T
}

export interface ReconcileOptions {
  /** Array items with the same value of this property are the same item (default `id`). */
  key?: string
}

/**
 * Update `target` (a store) to match `next`, changing only what differs, so only the code that
 * reads a changed property re-runs. Array items are matched by `key` (default `id`), else by index.
 * Useful to apply fresh server data: `reconcile(todos.items, await res.json())`.
 */
export function reconcile<T extends object>(target: T, next: T, options: ReconcileOptions = {}): void {
  if (!isStore(target)) throw new Error('[keeno] reconcile() needs a store as its first argument')
  apply(target as any, raw(next) as any, options.key ?? 'id')
}

function apply(target: any, next: any, key: string) {
  if (Array.isArray(next)) {
    const current = raw(target) as unknown[]
    const byKey = new Map<unknown, unknown>()
    for (const item of current) if (wrappable(item) && key in item) byKey.set((item as any)[key], item)
    next.forEach((item: any, i: number) => {
      const match = wrappable(item) && key in item ? byKey.get((item as any)[key]) : wrappable(item) ? current[i] : undefined
      if (match !== undefined && wrappable(match) && Array.isArray(match) === Array.isArray(item)) {
        apply(wrap(match), item, key)
        target[i] = match
      } else target[i] = item
    })
    target.length = next.length
    return
  }
  const r = raw(target)
  for (const k of Object.keys(r)) if (!Object.hasOwn(next, k)) delete target[k]
  for (const k of Object.keys(next)) {
    const cur = r[k]
    const v = next[k]
    if (wrappable(cur) && wrappable(v) && Array.isArray(cur) === Array.isArray(v)) apply(wrap(cur), v, key)
    else target[k] = v
  }
}

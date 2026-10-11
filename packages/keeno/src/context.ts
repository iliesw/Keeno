// Context: values a component provides to all of its descendants, found through the owner tree.
import { Derived, getOwner, isSignal, type Signal } from './signal'

export interface Context<T> {
  readonly id: symbol
  /** Returned by `inject()` when no ancestor provided a value. */
  readonly defaultValue: T
}

/** Create a context. Pass a state as the provided value to make it reactive. */
export function createContext<T>(defaultValue: T, name?: string): Context<T>
export function createContext<T>(): Context<T | undefined>
export function createContext<T>(defaultValue?: T, name = 'context'): Context<T | undefined> {
  return { id: Symbol(name), defaultValue }
}

/** Provide `value` for `ctx` to the current component and everything rendered inside it. */
export function provide<T>(ctx: Context<T>, value: T): void {
  const owner = getOwner()
  if (!owner) throw new Error('[keeno] provide() must be called while a component is being created')
  ;(owner.context ??= new Map()).set(ctx.id, value)
}

/**
 * The value provided for `ctx` by the closest ancestor, or its default value. Call it while the
 * component is being created (not in event handlers or timers, which run outside the tree).
 */
export function inject<T>(ctx: Context<T>): T {
  for (let o = getOwner(); o; o = o.parent) {
    if (o.context?.has(ctx.id)) return o.context.get(ctx.id) as T
  }
  return ctx.defaultValue
}

/**
 * `.kn` files: the value of `const x = inject(ctx)` as a signal, so `x` reads like a state. A
 * provided state or derived is returned as is (writes to a state reach the provider); any other
 * value is wrapped in a read-only signal.
 */
export function toSignal<T>(value: T): Signal<T> {
  return isSignal(value) ? (value as Signal<T>) : new Derived(() => value)
}

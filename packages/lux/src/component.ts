// Component instantiation, props merging and mounting.
import { ComponentOwner, mountComponent } from './lifecycle'
import { insert } from './dom'
import { Owner, flush, getOwner, queueMount, runWithOwner, untrack } from './signal'

export type Component<P = any> = (props: P) => unknown

/** Nested markup passed to a component: a function that renders it. Declare it as `children?: Children`. */
export type Children = () => unknown

/**
 * Create a component instance owned by the current owner. The component function runs
 * untracked; `init`/`update` jobs run once its DOM has been inserted (children before parents).
 */
export function createComponent<P extends Record<string, any>>(Comp: Component<P>, props: P): unknown {
  const owner = new ComponentOwner(getOwner(), props)
  const out = runWithOwner(owner, () => untrack(() => Comp(props)))
  queueMount(() => mountComponent(owner))
  return out
}

/**
 * Merge several props sources (objects with getters) into one, lazily. Later sources win.
 * Used for spread props: `<Item {...a} b={x} />`.
 */
export function mergeProps(...sources: (Record<string, any> | (() => Record<string, any>))[]): Record<string, any> {
  const resolve = (s: (typeof sources)[number]) => (typeof s === 'function' ? s() ?? {} : s)
  const get = (key: string | symbol) => {
    for (let i = sources.length - 1; i >= 0; i--) {
      const s = resolve(sources[i])
      if (key in s) return s[key as string]
    }
    return undefined
  }
  return new Proxy({} as Record<string, any>, {
    get: (_, key) => get(key),
    has(_, key) {
      return sources.some((s) => key in resolve(s))
    },
    ownKeys() {
      const keys = new Set<string | symbol>()
      for (const s of sources) for (const k of Reflect.ownKeys(resolve(s))) keys.add(k)
      return [...keys]
    },
    getOwnPropertyDescriptor(_, key) {
      if (!sources.some((s) => key in resolve(s))) return undefined
      return { enumerable: true, configurable: true, get: () => get(key) }
    },
  })
}

export interface MountedApp {
  /** Destroy the component tree and remove its nodes. */
  destroy(): void
}

/** Render `Comp` at the end of `target`, run its `init`/`update` jobs, and return a handle. */
export function mount<P extends Record<string, any>>(Comp: Component<P>, target: Node, props: P = {} as P): MountedApp {
  const root = new Owner(null)
  const nodes = runWithOwner(root, () => insert(target, () => createComponent(Comp, props)))
  flush()
  return {
    destroy() {
      const current = nodes()
      root.dispose()
      for (const n of current) n.parentNode?.removeChild(n)
    },
  }
}

// Component instantiation, props merging and mounting.
import { devHook, isDev } from './dev'
import { installDevtools, internalRoots } from './devtools'
import { ComponentOwner, callerScope, mountComponent } from './lifecycle'
import { insert, isServer, isStatic, region } from './dom'
import { Owner, flush, getOwner, handleError, installAsyncRegistry, queueMount, runWithOwner, untrack, type AsyncRegistry } from './signal'

export type Component<P = any> = (props: P) => unknown

/** Nested markup passed to a component: a function that renders it. Declare it as `children?: Children`. */
export type Children = () => unknown

/**
 * Create a component instance owned by the current owner. The component function runs
 * untracked; `init`/`update` jobs run once its DOM has been inserted (children before parents).
 * Reactive output (a function, or an array containing one) is rendered under the component's
 * owner, so context and error boundaries reach everything it renders. `scope` is the scope class
 * of the `.kn` component whose markup contains this one (see `callerScope`).
 */
export function createComponent<P extends Record<string, any>>(Comp: Component<P>, props: P, scope?: string): unknown {
  const owner = new ComponentOwner(getOwner(), props, Comp, scope ?? null)
  let out: unknown
  try {
    out = runWithOwner(owner, () => {
      const result = untrack(() => Comp(props))
      return isStatic(result) ? result : region(result)
    })
  } catch (err) {
    owner.dispose()
    handleError(err, owner.parent)
    return undefined
  }
  devHook?.component(owner, out)
  // Nothing mounts on the server: `init` and `update` don't run there.
  if (!isServer()) queueMount(() => mountComponent(owner))
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

/** Props of `<Dynamic>`: the component to render, plus the props passed through to it. */
export type DynamicProps<P = Record<string, any>> = P & { component: Component<P> | null | undefined | false }

/**
 * Render the component in the `component` prop with the other props. The instance is re-created
 * when `component` changes: `<Dynamic component={tabs[current]} user={user} />`.
 */
export function Dynamic<P extends Record<string, any>>(props: DynamicProps<P>): unknown {
  const rest = new Proxy(props, {
    get: (target, key) => (key === 'component' ? undefined : Reflect.get(target, key)),
    has: (target, key) => key !== 'component' && Reflect.has(target, key),
    ownKeys: (target) => Reflect.ownKeys(target).filter((k) => k !== 'component'),
  }) as unknown as P
  const scope = callerScope() ?? undefined
  return () => {
    const C = props.component
    return C ? untrack(() => createComponent(C, rest, scope)) : null
  }
}

export interface MountedApp {
  /** Destroy the component tree and remove its nodes. */
  destroy(): void
}

/** Root owners of mounted apps, for the dev tools hook. */
const roots = new Set<Owner>()

/** Render `Comp` at the end of `target`, run its `init`/`update` jobs, and return a handle. */
export function mount<P extends Record<string, any>>(Comp: Component<P>, target: Node, props: P = {} as P): MountedApp {
  return mountRoot(Comp, target, props, false)
}

/**
 * @internal Mount the dev tools panel. The dev tools ignore everything under it: it is not in the
 * component tree, and its own updates are not reported as renders, writes or flushes.
 */
export function mountDevtools<P extends Record<string, any>>(Comp: Component<P>, target: Node, props: P = {} as P): MountedApp {
  return mountRoot(Comp, target, props, true)
}

function mountRoot<P extends Record<string, any>>(
  Comp: Component<P>,
  target: Node,
  props: P,
  internal: boolean,
  registry?: AsyncRegistry,
): MountedApp {
  const root = new Owner(null)
  // Hydration: async deriveds created by the first render start with the server's values.
  const removeRegistry = registry ? installAsyncRegistry(root, registry) : null
  if (internal) internalRoots.add(root)
  else if (isDev()) {
    roots.add(root)
    installDevtoolsHook()
  }
  let nodes: (() => Node[]) | undefined
  try {
    nodes = runWithOwner(root, () => insert(target, () => createComponent(Comp, props)))
    flush()
  } catch (err) {
    removeRegistry?.()
    // Don't leave a half-mounted app behind: its computations would keep running.
    const current = nodes?.() ?? []
    root.dispose()
    roots.delete(root)
    for (const n of current) n.parentNode?.removeChild(n)
    throw err
  }
  removeRegistry?.()
  const rendered = nodes
  return {
    destroy() {
      const current = rendered()
      root.dispose()
      roots.delete(root)
      for (const n of current) n.parentNode?.removeChild(n)
    },
  }
}

/**
 * Take over server-rendered markup in `target`: the app is rendered client-side and replaces the
 * server nodes in the same task, so there is no flash. Focus, selection and text typed into
 * inputs before this runs are not kept.
 */
export function hydrate<P extends Record<string, any>>(Comp: Component<P>, target: Element, props: P = {} as P): MountedApp {
  const data = readServerData(target.ownerDocument)
  const fragment = target.ownerDocument.createDocumentFragment()
  while (target.firstChild) fragment.appendChild(target.firstChild)
  try {
    return mountRoot(Comp, target, props, false, {
      next: 0,
      peek: (id) => (Object.hasOwn(data, id) ? { value: data[id] } : undefined),
      created: () => {},
    })
  } catch (err) {
    // Keep the server markup if the client render fails.
    target.replaceChildren(fragment)
    throw err
  }
}

/** Values of async deriveds that renderToString / renderToStream sent (`<script data-keeno-data>`). */
function readServerData(doc: Document): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const el of doc.querySelectorAll('script[data-keeno-data]')) {
    try {
      Object.assign(data, JSON.parse(el.textContent ?? '{}'))
    } catch {
      // malformed: those values are fetched again
    }
  }
  return data
}

// ---------------------------------------------------------------------------
// Dev tools hook: `__KEENO_DEVTOOLS__.tree()` in the browser console (development mode only). The
// in-page panel (`@inflector/keeno/devtools`) uses the richer API installed by devtools.ts.

export interface ComponentInfo {
  name: string
  props: Record<string, unknown>
  children: ComponentInfo[]
}

/** The component trees of all mounted apps. */
export function inspect(): ComponentInfo[] {
  const walk = (o: Owner, out: ComponentInfo[]) => {
    if (o instanceof ComponentOwner && !o.disposed) {
      const info: ComponentInfo = { name: o.component?.name || 'Anonymous', props: {}, children: [] }
      untrack(() => {
        for (const key of Object.keys(o.props)) {
          try {
            info.props[key] = o.props[key]
          } catch (err) {
            info.props[key] = err
          }
        }
      })
      out.push(info)
      out = info.children
    }
    for (const child of o.children ?? []) walk(child, out)
  }
  const out: ComponentInfo[] = []
  for (const r of roots) walk(r, out)
  return out
}

function installDevtoolsHook() {
  installDevtools(roots, {
    tree: inspect,
    /** Print the component tree with console.group. */
    print() {
      const show = (nodes: ComponentInfo[]) => {
        for (const n of nodes) {
          console.groupCollapsed(n.name, n.props)
          show(n.children)
          console.groupEnd()
        }
      }
      show(inspect())
    },
  })
}

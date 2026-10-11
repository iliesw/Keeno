// Component owners and the lifecycle helpers: init / update / destroy / props.
import {
  Owner,
  Signal,
  createComputation,
  getOwner,
  handleError,
  onCleanup,
  queueMount,
  runWithOwner,
  untrack,
  type Cleanup,
} from './signal'

type MaybeCleanup = void | Cleanup | undefined
/** An explicit dependency: a state or derived, or a getter function (used for props). */
export type Dep = Signal<any> | (() => unknown)

export class ComponentOwner extends Owner {
  props: Record<string, any>
  /** The component function (used by dev tools). */
  component: Function | null
  /** Scope class of the `.lx` component whose markup created this one, if it has a <style>. */
  scope: string | null
  mounted = false
  mountJobs: (() => void)[] = []

  constructor(parent: Owner | null, props: Record<string, any>, component: Function | null = null, scope: string | null = null) {
    super(parent)
    this.props = props
    this.component = component
    this.scope = scope
  }
}

/**
 * The scope class of the `.lx` component that rendered the current component, or null. Call it
 * while the component is being created. Built-in components that render their own elements
 * (like `<Link>`) add it so the caller's scoped styles reach them.
 */
export function callerScope(): string | null {
  let o = getOwner()
  while (o && !(o instanceof ComponentOwner)) o = o.parent
  return o?.scope ?? null
}

/** Run a mount job, sending what it throws to the nearest error boundary. */
function runJob(owner: ComponentOwner, job: () => void) {
  try {
    runWithOwner(owner, job)
  } catch (err) {
    handleError(err, owner)
  }
}

function currentComponent(api: string): ComponentOwner {
  let o = getOwner()
  while (o && !(o instanceof ComponentOwner)) o = o.parent
  if (!o) throw new Error(`[lux] ${api}() must be called while a component is being created`)
  return o
}

function addMountJob(owner: ComponentOwner, job: () => void) {
  if (owner.mounted) queueMount(() => owner.disposed || runJob(owner, job))
  else owner.mountJobs.push(job)
}

/** Called once the component's DOM is in place. Runs init/update jobs in declaration order. */
export function mountComponent(owner: ComponentOwner) {
  if (owner.disposed || owner.mounted) return
  owner.mounted = true
  const jobs = owner.mountJobs
  owner.mountJobs = []
  for (const job of jobs) {
    if (owner.disposed) return
    runJob(owner, job)
  }
}

/** Run `fn` once after the component's DOM is inserted. A returned function runs on destroy. */
export function init(fn: () => MaybeCleanup): void {
  const owner = currentComponent('init')
  addMountJob(owner, () => {
    const r = untrack(fn)
    if (typeof r === 'function') onCleanup(r, owner)
  })
}

/**
 * `update(fn, deps)`: runs only when one of `deps` changes (not on mount).
 * `update(fn)`: runs after mount, then whenever a state read inside `fn` changes. In .lx files the
 * compiler passes the deps `fn` reads, so there it does not run on mount either.
 * A returned function is used as cleanup before the next run and on destroy.
 */
export function update(fn: () => MaybeCleanup, deps?: readonly Dep[]): void {
  const owner = currentComponent('update')
  if (!deps) {
    addMountJob(owner, () => {
      createComputation(() => {
        const r = fn()
        if (typeof r === 'function') onCleanup(r)
      }, 'user')
    })
    return
  }
  addMountJob(owner, () => {
    let first = true
    createComputation(() => {
      for (const d of deps) {
        if (d instanceof Signal) d.get()
        else if (typeof d === 'function') d()
      }
      if (first) {
        first = false
        return
      }
      untrack(() => {
        const r = fn()
        if (typeof r === 'function') onCleanup(r)
      })
    }, 'user')
  })
}

/** Run `fn` when the component unmounts. */
export function destroy(fn: Cleanup): void {
  onCleanup(fn, currentComponent('destroy'))
}

/** The current component's props object (its fields are reactive getters). */
export function props<P extends Record<string, any> = Record<string, any>>(): P {
  return currentComponent('props').props as P
}

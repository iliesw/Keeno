// Component owners and the lifecycle helpers: init / update / destroy / props.
import {
  Owner,
  Signal,
  createComputation,
  getOwner,
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
  mounted = false
  mountJobs: (() => void)[] = []

  constructor(parent: Owner | null, props: Record<string, any>) {
    super(parent)
    this.props = props
  }
}

function currentComponent(api: string): ComponentOwner {
  let o = getOwner()
  while (o && !(o instanceof ComponentOwner)) o = o.parent
  if (!o) throw new Error(`[lux] ${api}() must be called while a component is being created`)
  return o
}

function addMountJob(owner: ComponentOwner, job: () => void) {
  if (owner.mounted) queueMount(() => owner.disposed || runWithOwner(owner, job))
  else owner.mountJobs.push(job)
}

/** Called once the component's DOM is in place. Runs init/update jobs in declaration order. */
export function mountComponent(owner: ComponentOwner) {
  if (owner.disposed || owner.mounted) return
  owner.mounted = true
  const jobs = owner.mountJobs
  owner.mountJobs = []
  runWithOwner(owner, () => {
    for (const job of jobs) job()
  })
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
 * `update(fn)`: runs after mount, then whenever a state read inside `fn` changes.
 * `update(fn, deps)`: runs only when one of `deps` changes (not on mount).
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

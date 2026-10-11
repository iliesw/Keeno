// Hot module replacement: a stable wrapper per component file whose implementation can be swapped.
import { createComponent, type Component } from './component'
import { callerScope } from './lifecycle'
import { State } from './state'

interface HotRecord {
  impl: State<Component>
  wrapper: Component
}

const KEY = Symbol.for('keeno.hmr')
const registry: Map<string, HotRecord> = ((globalThis as any)[KEY] ??= new Map())

/**
 * Register `Comp` under `id` and return a stable wrapper component. The first call creates
 * the wrapper; later calls (a re-executed module) swap the implementation, which re-mounts
 * every live instance with the same props. State owned by parents is untouched.
 */
export function hot(Comp: Component, id: string): Component {
  const existing = registry.get(id)
  if (existing) {
    existing.impl.set(Comp)
    return existing.wrapper
  }
  const impl = new State(Comp)
  // Returns a function, so the caller's insert tracks `impl` and re-creates the instance on swap.
  const wrapper: Component = (props) => {
    const scope = callerScope() ?? undefined
    return () => createComponent(impl.get(), props, scope)
  }
  Object.defineProperty(wrapper, 'name', { value: `Hot(${Comp.name})` })
  // The dev tools show the component inside instead.
  ;(wrapper as any).__keenoHot = true
  registry.set(id, { impl, wrapper })
  return wrapper
}

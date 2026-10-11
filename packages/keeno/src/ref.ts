// Element refs: `const el = ref()` then `<div ref={el} />`.
import { onCleanup } from './signal'
import { State } from './state'

/** A reference to an element. `current` is the element while it is rendered, `null` otherwise; reading it is reactive. */
export class Ref<T extends Element = HTMLElement> {
  private readonly _el = new State<T | null>(null)

  get current(): T | null {
    return this._el.get()
  }

  /** `current` without tracking it. */
  peek(): T | null {
    return this._el.peek()
  }

  /** @internal */
  _set(el: T | null): void {
    this._el.set(el)
  }
}

export function ref<T extends Element = HTMLElement>(): Ref<T> {
  return new Ref<T>()
}

export function isRef(v: unknown): v is Ref<Element> {
  return v instanceof Ref
}

/** What `ref={…}` accepts: a `Ref`, or a callback called with the element (and with `null` on destroy). */
export type RefTarget<T extends Element = Element> = Ref<T> | ((el: T | null) => void) | null | undefined

/** `ref={target}` on an element: point `target` at `el` until the owning scope is destroyed. */
export function setRef(el: Element, target: RefTarget<any>): void {
  if (target == null) return
  if (target instanceof Ref) {
    target._set(el)
    onCleanup(() => {
      if (target.peek() === el) target._set(null)
    })
  } else if (typeof target === 'function') {
    target(el)
    onCleanup(() => target(null))
  } else {
    throw new Error(`[keeno] ref needs a ref() or a function, got ${typeof target}`)
  }
}

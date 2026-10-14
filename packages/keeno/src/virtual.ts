// <Virtual>: a scrolling list that only renders the rows in view (plus `overscan` rows around them).
import { attr, getDocument, insert, isServer } from './dom'
import { callerScope, init } from './lifecycle'
import { Ref, setRef } from './ref'
import { Owner, createComputation, derived, onCleanup, runWithOwner, untrack } from './signal'
import { State } from './state'
import { trackKeys } from './store'

export interface VirtualProps<T> {
  /** The items. */
  each: readonly T[] | null | undefined
  /** Each row's height in px: one number for all rows, or a function of the item. */
  itemHeight: number | ((item: T, index: number) => number)
  /** Rows rendered above and below the visible ones (default 4). */
  overscan?: number
  /** Identity of an item (default: the item itself). A row is re-created when its key's item changes. */
  key?: (item: T, index: number) => unknown
  /** Viewport height used before the list is measured, and on the server (default 600). */
  initialHeight?: number
  /** Gets the list's handle: `scrollTo(index)` and the scroll container element. */
  ref?: Ref<HTMLElement> | ((list: VirtualHandle | null) => void)
  class?: unknown
  style?: unknown
  /** Renders one row: `{(item, index) => <Row item={item} />}`. */
  children?: () => (item: T, index: number) => unknown
}

/** What `ref` receives from `<Virtual>`. */
export interface VirtualHandle {
  /** Scroll so the row at `index` is at the top. */
  scrollTo(index: number, behavior?: ScrollBehavior): void
  readonly element: HTMLElement
}

interface Row<T> {
  key: unknown
  item: T
  index: number
  el: HTMLElement
  owner: Owner
}

/** The start offset of each row, plus the total height at the end. */
function offsetsOf<T>(items: readonly T[], height: VirtualProps<T>['itemHeight']): number[] {
  const out = new Array<number>(items.length + 1)
  let y = 0
  for (let i = 0; i < items.length; i++) {
    out[i] = y
    y += typeof height === 'number' ? height : height(items[i], i)
  }
  out[items.length] = y
  return out
}

/** The index of the row that contains `y`. */
function rowAt(offsets: number[], y: number): number {
  let lo = 0
  let hi = offsets.length - 2
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return Math.max(0, lo)
}

/**
 * A list that only renders the rows in view, for thousands of items:
 * `<Virtual each={rows} itemHeight={32} class="h-96">{(row) => <Row row={row} />}</Virtual>`.
 * Give it a height (with `class` or `style`): it scrolls inside itself. Rows are keyed, and keep
 * their DOM and state while they stay in view.
 */
export function Virtual<T>(props: VirtualProps<T>): unknown {
  const doc = getDocument()
  // The caller's scoped styles reach the container, like a plain element in its markup.
  const scope = callerScope() ?? undefined
  const container = doc.createElement('div') as HTMLElement
  const spacer = doc.createElement('div') as HTMLElement
  const win = doc.createElement('div') as HTMLElement
  container.setAttribute('data-keeno-virtual', '')
  attr(container, 'class', () => props.class, scope)
  attr(container, 'style', () => props.style)
  container.style.overflowY = 'auto'
  spacer.style.position = 'relative'
  win.style.position = 'absolute'
  win.style.top = '0'
  win.style.left = '0'
  win.style.right = '0'
  spacer.appendChild(win)
  container.appendChild(spacer)

  const scrollTop = new State(0)
  const viewport = new State(untrack(() => props.initialHeight) ?? 600)
  // A store array changes in place: track its items, and treat every run as a change.
  const items = derived(
    () => {
      const list = props.each ?? []
      trackKeys(list)
      return list
    },
    { equals: () => false },
  )
  const offsets = derived(() => offsetsOf(items.get(), props.itemHeight))
  const range = derived(
    () => {
      const o = offsets.get()
      const n = o.length - 1
      if (!n) return [0, 0] as const
      const over = props.overscan ?? 4
      const first = rowAt(o, scrollTop.get())
      const last = rowAt(o, scrollTop.get() + viewport.get())
      return [Math.max(0, first - over), Math.min(n, last + 1 + over)] as const
    },
    { equals: (a, b) => a[0] === b[0] && a[1] === b[1] },
  )

  // In a .kn file `{(row) => …}` arrives wrapped in a thunk, like any `{expression}` child.
  const rowRenderer = (): ((item: T, index: number) => unknown) | undefined => {
    let fn: unknown = props.children?.()
    while (typeof fn === 'function' && fn.length === 0) fn = fn()
    return fn as ((item: T, index: number) => unknown) | undefined
  }
  const listOwner = new Owner()
  let rows = new Map<unknown, Row<T>[]>()
  const createRow = (key: unknown, item: T, index: number): Row<T> => {
    const owner = new Owner(listOwner)
    const el = doc.createElement('div') as HTMLElement
    runWithOwner(owner, () => {
      const render = untrack(rowRenderer)
      if (render) insert(el, () => untrack(() => render(item, index)))
    })
    return { key, item, index, el, owner }
  }

  createComputation(() => {
    const list = items.get()
    const o = offsets.get()
    const [start, end] = range.get()
    const keyOf = props.key
    untrack(() => {
      const fixed = typeof props.itemHeight === 'number'
      spacer.style.height = `${o[list.length]}px`
      win.style.transform = `translateY(${o[start] ?? 0}px)`
      const next = new Map<unknown, Row<T>[]>()
      const visible: Row<T>[] = []
      for (let i = start; i < end; i++) {
        const item = list[i]
        const key = keyOf ? keyOf(item, i) : item
        const bucket = rows.get(key)
        let row = bucket?.shift()
        if (row && (row.item !== item || row.index !== i)) {
          row.owner.dispose()
          row.el.remove()
          row = undefined
        }
        row ??= createRow(key, item, i)
        row.el.style.height = `${fixed ? props.itemHeight : o[i + 1] - o[i]}px`
        const list2 = next.get(key)
        if (list2) list2.push(row)
        else next.set(key, [row])
        visible.push(row)
      }
      for (const bucket of rows.values()) {
        for (const row of bucket) {
          row.owner.dispose()
          row.el.remove()
        }
      }
      rows = next
      let at = win.firstChild
      for (const row of visible) {
        if (row.el === at) at = at.nextSibling
        else win.insertBefore(row.el, at)
      }
    })
  })

  const handle: VirtualHandle = {
    scrollTo(index, behavior) {
      const o = offsets.peek()
      const top = o[Math.max(0, Math.min(index, o.length - 1))] ?? 0
      if (typeof container.scrollTo === 'function') container.scrollTo({ top, behavior })
      else container.scrollTop = top
      scrollTop.set(top)
    },
    element: container,
  }
  const target = untrack(() => props.ref)
  if (target instanceof Ref) setRef(container, target)
  else if (typeof target === 'function') {
    target(handle)
    onCleanup(() => target(null))
  }

  if (!isServer()) {
    init(() => {
      let frame = 0
      const measure = () => {
        frame = 0
        scrollTop.set(container.scrollTop)
        if (container.clientHeight) viewport.set(container.clientHeight)
      }
      const onScroll = () => {
        if (!frame) frame = requestAnimationFrame(measure)
      }
      measure()
      container.addEventListener('scroll', onScroll, { passive: true })
      const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => onScroll()) : null
      resize?.observe(container)
      return () => {
        container.removeEventListener('scroll', onScroll)
        resize?.disconnect()
        if (frame) cancelAnimationFrame(frame)
      }
    })
  }
  return container
}

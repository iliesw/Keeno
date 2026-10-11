// DOM helpers used by compiled templates.
import { Owner, createComputation, memo, runWithOwner, untrack } from './signal'
import { State } from './state'

/**
 * Parse `html` once (lazily) and return a function that clones its first node. With `svg`, the
 * html is SVG content (e.g. `<circle>`): it is parsed inside an `<svg>` so that it gets the SVG
 * namespace, and the wrapper is dropped.
 */
export function template(html: string, svg = false): () => Node {
  let node: Node | undefined
  return () => {
    if (!node) {
      const tpl = document.createElement('template')
      tpl.innerHTML = svg ? `<svg>${html}</svg>` : html
      node = svg ? tpl.content.firstChild!.firstChild! : tpl.content.firstChild!
    }
    return node.cloneNode(true)
  }
}

// ---------------------------------------------------------------------------
// insert

/** Flatten a static renderable value (no functions) into DOM nodes. */
function collect(value: unknown, out: Node[]) {
  if (value == null || typeof value === 'boolean') return
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out)
  } else if (value instanceof Node) {
    if (value.nodeType === 11) out.push(...value.childNodes)
    else out.push(value)
  } else {
    out.push(document.createTextNode(String(value)))
  }
}

/** True if rendering `value` never needs to re-run (no functions inside). */
function isStatic(value: unknown): boolean {
  if (typeof value === 'function') return false
  if (Array.isArray(value)) return value.every(isStatic)
  return true
}

/** Replace `current` with `next` before `marker`, moving only nodes that are out of place. */
function reconcile(parent: Node, current: Node[], next: Node[], marker: Node | null) {
  if (next.length === current.length && next.every((n, i) => n === current[i])) return
  if (current.length) {
    const keep = new Set(next)
    for (const n of current) if (!keep.has(n) && n.parentNode === parent) parent.removeChild(n)
  }
  let ref = marker
  for (let i = next.length - 1; i >= 0; i--) {
    const n = next[i]
    if (n.parentNode !== parent || n.nextSibling !== ref) parent.insertBefore(n, ref)
    ref = n
  }
}

function patch(parent: Node, value: unknown, current: Node[], marker: Node | null): Node[] {
  const t = typeof value
  if ((t === 'string' || t === 'number' || t === 'bigint') && current.length === 1 && current[0].nodeType === 3) {
    const text = current[0] as Text
    const s = String(value)
    if (text.data !== s) text.data = s
    return current
  }
  const next: Node[] = []
  collect(value, next)
  reconcile(marker?.parentNode ?? parent, current, next, marker)
  return next
}

/**
 * Resolve a renderable value and pass the result to `commit` (again whenever it changes).
 * Every function, including each function inside an array, gets its own computation, so
 * re-running one never re-evaluates (or re-creates) its siblings or the outer expression.
 */
function resolve(value: unknown, commit: (v: unknown) => void) {
  if (typeof value === 'function') {
    createComputation(() => resolve((value as () => unknown)(), commit))
  } else if (isStatic(value)) {
    commit(value)
  } else {
    const slots: Node[][] = []
    let ready = false
    ;(value as unknown[]).forEach((item, i) =>
      resolve(item, (v) => {
        const nodes: Node[] = []
        collect(v, nodes)
        slots[i] = nodes
        if (ready) commit(slots.flat())
      }),
    )
    ready = true
    commit(slots.flat())
  }
}

/**
 * Render `value` into `parent` before `marker` (or at the end). Functions are called inside
 * tracked computations, so the region updates when the states they read change. Handles
 * strings, numbers, nodes, arrays, null/false and nested functions. Returns the current nodes.
 */
export function insert(parent: Node, value: unknown, marker: Node | null = null): () => Node[] {
  let current: Node[] = []
  resolve(value, (v) => (current = patch(parent, v, current, marker)))
  return () => current
}

// ---------------------------------------------------------------------------
// conditionals (the compiler emits these for top-level `&&`, `||` and `?:` in `{…}`)

/** `test && then()`: the region only re-renders when `test` flips between falsy and truthy. */
export function and(test: () => unknown, then: () => unknown): () => unknown {
  const t = memo(test, (a, b) => (!!a && !!b) || Object.is(a, b))
  return () => {
    const v = t()
    return v ? then() : v
  }
}

/** `test || otherwise()`: the fallback only re-renders when `test` flips. */
export function or(test: () => unknown, otherwise: () => unknown): () => unknown {
  const t = memo(test, (a, b) => (!a && !b) || Object.is(a, b))
  return () => t() || otherwise()
}

/** `test ? a() : b()`: re-renders only when the truthiness of `test` changes. */
export function cond(test: () => unknown, a: () => unknown, b: () => unknown): () => unknown {
  const t = memo(() => !!test())
  return () => (t() ? a() : b())
}

// ---------------------------------------------------------------------------
// keyed lists

interface Row<T> {
  key: unknown
  item: State<T>
  index: State<number>
  owner: Owner
  nodes: Node[]
}

/**
 * Keyed list rendering for `{list.map(item => <li key={…}>…</li>)}`. Rows are reused by key;
 * when a key's item changes, the row's `item` state is updated instead of re-rendering it.
 * `render` receives the item and index as states. Returns an accessor of the list's nodes,
 * to be passed to `insert`.
 */
export function mapKeyed<T>(
  list: () => readonly T[] | null | undefined | false,
  key: (item: T, index: number) => unknown,
  render: (item: State<T>, index: State<number>) => unknown,
): () => Node[] {
  const listOwner = new Owner()
  const out = new State<Node[]>([], { equals: () => false })
  let rows: Row<T>[] = []
  const publish = () => out.set(rows.flatMap((r) => r.nodes))

  const createRow = (k: unknown, value: T, i: number): Row<T> => {
    const row: Row<T> = { key: k, item: new State(value), index: new State(i), owner: new Owner(listOwner), nodes: [] }
    runWithOwner(row.owner, () => {
      let ready = false
      resolve(render(row.item, row.index), (v) => {
        const nodes: Node[] = []
        collect(v, nodes)
        row.nodes = nodes
        if (ready) publish()
      })
      ready = true
    })
    return row
  }

  createComputation(() => {
    const items = list() || []
    untrack(() => {
      const old = new Map<unknown, Row<T>[]>()
      for (const r of rows) {
        const bucket = old.get(r.key)
        if (bucket) bucket.push(r)
        else old.set(r.key, [r])
      }
      const next: Row<T>[] = []
      items.forEach((value, i) => {
        const k = key(value, i)
        const row = old.get(k)?.shift()
        if (row) {
          row.item.set(value)
          row.index.set(i)
          next.push(row)
        } else {
          next.push(createRow(k, value, i))
        }
      })
      for (const bucket of old.values()) for (const r of bucket) r.owner.dispose()
      rows = next
      publish()
    })
  })

  return () => out.get()
}

// ---------------------------------------------------------------------------
// attributes, events, bindings

/** Attributes that must be set as DOM properties to take effect after the initial render. */
const PROPERTIES = new Set(['value', 'checked', 'selected', 'indeterminate', 'muted', 'innerHTML', 'textContent'])
const ATTR_ALIASES: Record<string, string> = { className: 'class', htmlFor: 'for' }

/** `class` values: strings, arrays (nested, falsy entries skipped) and `{ name: condition }` objects. */
export function classValue(v: unknown): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(classValue).filter(Boolean).join(' ')
  if (typeof v === 'object') {
    return Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k])
      .join(' ')
  }
  return String(v)
}

function setAttr(el: Element, name: string, v: unknown, scope?: string) {
  if (name === 'class') {
    let cls = classValue(v)
    if (scope) cls = cls ? `${cls} ${scope}` : scope
    if (el.getAttribute('class') !== cls) el.setAttribute('class', cls)
  } else if (PROPERTIES.has(name) && name in el) {
    const value = name === 'value' ? (v == null ? '' : v) : v
    if ((el as any)[name] !== value) (el as any)[name] = value
  } else if (v == null || v === false) {
    el.removeAttribute(name)
  } else {
    const value = v === true ? '' : String(v)
    if (el.getAttribute(name) !== value) el.setAttribute(name, value)
  }
}

/**
 * Set an attribute. If `value` is a function it is tracked and re-applied on change.
 * For `class`, `scope` (the component's hash class) is always kept.
 */
export function attr(el: Element, name: string, value: unknown, scope?: string): void {
  if (typeof value === 'function') createComputation(() => setAttr(el, name, (value as () => unknown)(), scope))
  else setAttr(el, name, value, scope)
}

/**
 * Apply a props object to an element (`<input {...attrs} />`): attributes, `class` (keeping the
 * scope class) and `onX` event handlers. Re-applied when it changes; removed keys are cleared.
 */
export function spread(el: Element, props: Record<string, unknown>, scope?: string): void {
  let prev: Record<string, unknown> = {}
  createComputation(() => {
    const next: Record<string, unknown> = {}
    for (const key of Object.keys(props)) next[key] = props[key]
    untrack(() => {
      for (const key of Object.keys(prev)) if (!(key in next)) apply(key, prev[key], undefined)
      for (const key of Object.keys(next)) if (prev[key] !== next[key] || !(key in prev)) apply(key, prev[key], next[key])
    })
    prev = next
  })

  function apply(key: string, old: unknown, value: unknown) {
    if (key === 'children' || key === 'key') return
    if (/^on[A-Z]/.test(key)) {
      const type = key.slice(2).toLowerCase()
      if (typeof old === 'function') el.removeEventListener(type, old as EventListener)
      if (typeof value === 'function') el.addEventListener(type, value as EventListener)
      return
    }
    setAttr(el, ATTR_ALIASES[key] ?? key, value, scope)
  }
}

export function on(el: Element, type: string, handler: (e: any) => void): void {
  el.addEventListener(type, handler)
}

/** Two-way binding between an input property (`value` or `checked`) and a state. */
export function bind(el: Element, prop: 'value' | 'checked', target: State<any>): void {
  if (!(target instanceof State)) throw new Error(`[lux] bind:${prop} needs a state, got ${typeof target}`)
  const input = el as HTMLInputElement
  if (prop === 'checked') {
    createComputation(() => {
      input.checked = !!target.get()
    })
    input.addEventListener('change', () => {
      target.set(input.checked)
      if (!target._isPending() && !!target.peek() !== input.checked) input.checked = !!target.peek()
    })
    return
  }
  const numeric = input.type === 'number' || input.type === 'range'
  const show = (v: unknown) => {
    const s = v == null ? '' : String(v)
    if (input.value !== s) input.value = s
  }
  createComputation(() => show(target.get()))
  const event = el.tagName === 'SELECT' ? 'change' : 'input'
  input.addEventListener(event, () => {
    const entered = numeric ? (input.value === '' ? null : Number(input.value)) : input.value
    target.set(entered)
    // A `validate` option may have rejected or coerced the write: show what was stored.
    if (!target._isPending() && !Object.is(target.peek(), entered)) show(target.peek())
  })
}

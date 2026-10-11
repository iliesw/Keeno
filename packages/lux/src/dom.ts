// DOM helpers used by compiled templates.
import { isDev, warn } from './dev'
import { Owner, createComputation, memo, queueMount, runWithOwner, untrack } from './signal'
import { State } from './state'
import { setRef } from './ref'

let serverDocument: Document | null = null

/** The document nodes are created in: the browser's, or the one `renderToString` installed. */
export function getDocument(): Document {
  return serverDocument ?? document
}

/** @internal Render into `doc` instead of the global document (server rendering). */
export function setDocument(doc: Document | null): void {
  serverDocument = doc
}

/** True while rendering on the server (`renderToString`). */
export function isServer(): boolean {
  return serverDocument !== null
}

/** True for DOM nodes. Duck-typed, so nodes from a server-side DOM work too. */
export function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as Node).nodeType === 'number'
}

/**
 * Parse `html` once (lazily) and return a function that clones its first node. With `svg`, the
 * html is SVG content (e.g. `<circle>`): it is parsed inside an `<svg>` so that it gets the SVG
 * namespace, and the wrapper is dropped.
 */
export function template(html: string, svg = false): () => Node {
  let node: Node | undefined
  let owner: Document | undefined
  return () => {
    const doc = getDocument()
    if (!node || owner !== doc) {
      const tpl = doc.createElement('template')
      tpl.innerHTML = svg ? `<svg>${html}</svg>` : html
      node = svg ? tpl.content.firstChild!.firstChild! : tpl.content.firstChild!
      owner = doc
    }
    return node.cloneNode(true)
  }
}

// ---------------------------------------------------------------------------
// insert

/** Flatten a static renderable value (no functions) into DOM nodes. */
export function collect(value: unknown, out: Node[]): void {
  if (value == null || typeof value === 'boolean') return
  if (Array.isArray(value)) {
    for (const v of value) collect(v, out)
  } else if (isNode(value)) {
    if (value.nodeType === 11) out.push(...value.childNodes)
    else out.push(value)
  } else {
    out.push(getDocument().createTextNode(String(value)))
  }
}

/** True if rendering `value` never needs to re-run (no functions inside). */
export function isStatic(value: unknown): boolean {
  if (typeof value === 'function') return false
  if (Array.isArray(value)) return value.every(isStatic)
  return true
}

// ---------------------------------------------------------------------------
// moving nodes

/**
 * Insert `node` before `ref`. A node that is already in the document is moved with the native
 * `moveBefore` where the browser has it, which keeps its state: focus, selection, iframes that
 * stay loaded, playing media and running CSS animations and transitions.
 */
function move(parent: Node, node: Node, ref: Node | null): void {
  if (node.isConnected && parent.isConnected && typeof (parent as any).moveBefore === 'function') {
    try {
      ;(parent as any).moveBefore(node, ref)
      return
    } catch {
      // Not movable here (for example across shadow roots): fall back to a plain insert.
    }
  }
  parent.insertBefore(node, ref)
}

// Reparentable content (see reparent.ts) gets two extra guarantees, so that it is moved natively
// wherever it goes, whatever order the regions involved update in:
// - A region that drops it leaves it in place until the end of the update (the "sweep"), and it
//   is only removed then if no region rendered it again since. The same goes for a dropped node
//   that contains reparentable content waiting to move (the branch it is moving out of).
// - A region that renders it into a parent that is not in the document yet (a branch that was
//   just created) puts a comment there instead, and the node moves to the comment at the sweep,
//   once the new branch has been attached.

/** Nodes of live `reparentable()` content. */
const kept = new WeakSet<Node>()
let keptCount = 0
/** Order of claims and drops within an update. */
let stamp = 0
/** When each kept node was last rendered by a region. */
const claims = new Map<Node, number>()
/** Kept nodes a region dropped: the parent they were dropped from, and when. */
const dropped = new Map<Node, { parent: Node; at: number }>()
/** Kept nodes waiting for their new parent to be attached, and the comment holding their spot. */
const standIns = new Map<Node, Comment>()
const standInOf = new Map<Comment, Node>()
let sweepQueued = false

/** @internal Mark `nodes` as reparentable content. */
export function keep(nodes: Node[]): void {
  for (const n of nodes) kept.add(n)
}

/** @internal Count live reparentables: regions only do the extra work while some exist. */
export function trackKept(delta: number): void {
  keptCount += delta
}

function queueSweep() {
  if (sweepQueued) return
  sweepQueued = true
  // Before other mount jobs, so that `init` callbacks see the moved nodes in place.
  queueMount(sweep, true)
}

function dropStandIn(node: Node) {
  const c = standIns.get(node)
  if (!c) return
  standIns.delete(node)
  standInOf.delete(c)
  c.parentNode?.removeChild(c)
}

/** Finish the moves held by stand-ins, then remove the dropped nodes nothing rendered again. */
function sweep() {
  sweepQueued = false
  for (const [node, c] of standIns) if (c.parentNode) move(c.parentNode, node, c)
  for (const node of [...standIns.keys()]) dropStandIn(node)
  for (const [n, { parent, at }] of dropped) {
    if ((claims.get(n) ?? 0) < at && n.parentNode === parent) parent.removeChild(n)
  }
  dropped.clear()
  claims.clear()
}

/**
 * Move `node` into `parent`, before `before` (or at the end), keeping its state where the browser
 * has the native `moveBefore`: focus, selection, loaded iframes, playing media and running CSS
 * animations. Elsewhere, or when the node or `parent` is not in the document, it is a plain insert.
 */
export function moveNode(node: Node, parent: Node, before: Node | null = null): void {
  dropStandIn(node)
  move(parent, node, before)
}

/** @internal Take reparentable nodes out of the document (they stay alive). */
export function unplace(nodes: Node[]): void {
  for (const n of nodes) {
    dropStandIn(n)
    n.parentNode?.removeChild(n)
  }
}

/** Insert or move `node` before `ref` (see the notes on reparentable content above). */
function place(parent: Node, node: Node, ref: Node | null): void {
  if (keptCount && kept.has(node)) {
    if (node.isConnected && !parent.isConnected) {
      dropStandIn(node)
      const c = (parent.ownerDocument ?? getDocument()).createComment('')
      standIns.set(node, c)
      standInOf.set(c, node)
      parent.insertBefore(c, ref)
      queueSweep()
      return
    }
    dropStandIn(node)
  }
  move(parent, node, ref)
}

/** True if `n` contains kept nodes waiting to move: removing it now would take them out of the document. */
function holdsWaiting(n: Node): boolean {
  if (!standIns.size) return false
  for (const k of standIns.keys()) if (n.contains(k)) return true
  return false
}

/** Remove `n` from `parent` (see the notes on reparentable content above). */
function detach(parent: Node, n: Node) {
  const held = standInOf.get(n as Comment)
  if (held) {
    dropStandIn(held)
    n = held
    parent = held.parentNode!
    if (!parent) return
  } else if (!(keptCount && (kept.has(n) || holdsWaiting(n)))) {
    parent.removeChild(n)
    return
  }
  dropped.set(n, { parent, at: ++stamp })
  queueSweep()
}

/** The node that stands for `n` in the DOM right now: its stand-in while it waits to move. */
const standFor = (n: Node): Node => standIns.get(n) ?? n

/** Replace `current` with `next` before `marker`, moving only nodes that are out of place. */
export function reconcile(parent: Node, current: Node[], next: Node[], marker: Node | null): void {
  if (keptCount) {
    for (const n of next) if (kept.has(n)) claims.set(n, ++stamp)
    if (claims.size) queueSweep()
    if (standIns.size) {
      current = current.map(standFor)
      next = next.map(standFor)
    }
  }
  if (next.length === current.length && next.every((n, i) => n === current[i])) return
  // The fast path assumes `current` is still in place; something else may have moved its nodes.
  if (current.some((n) => n.parentNode !== parent)) return reconcileSlow(parent, current, next, marker)
  reconcileArrays(parent, current.slice(), next, marker)
}

/** Remove what isn't in `next`, then walk `next` backwards, moving each node that is out of place. */
function reconcileSlow(parent: Node, current: Node[], next: Node[], marker: Node | null) {
  if (current.length) {
    const keep = new Set(next)
    for (const n of current) if (!keep.has(n) && n.parentNode === parent) detach(parent, n)
  }
  let ref = marker
  for (let i = next.length - 1; i >= 0; i--) {
    const n = next[i]
    if (n.parentNode !== parent || n.nextSibling !== ref) place(parent, n, ref)
    ref = standFor(n)
  }
}

/**
 * Turn the contiguous nodes `a` (ending right before `after`) into `b` with few DOM operations:
 * skip the common prefix and suffix, handle pure insertions, removals and a backward swap
 * directly, and otherwise use a node -> index map, inserting runs that are already in order.
 * The approach of udomdiff (Andrea Giammarchi) and dom-expressions' reconcileArrays (Ryan
 * Carniato), both MIT licensed.
 */
function reconcileArrays(parent: Node, a: Node[], b: Node[], after: Node | null) {
  let aStart = 0
  let bStart = 0
  let aEnd = a.length
  let bEnd = b.length
  let map: Map<Node, number> | null = null
  while (aStart < aEnd || bStart < bEnd) {
    // Common prefix.
    if (aStart < aEnd && bStart < bEnd && a[aStart] === b[bStart]) {
      aStart++
      bStart++
      continue
    }
    // Common suffix.
    while (aEnd > aStart && bEnd > bStart && a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--
      bEnd--
    }
    if (aEnd === aStart) {
      // Only insertions left: before the first node of the matched suffix.
      const ref = bEnd < b.length ? b[bEnd] : after
      while (bStart < bEnd) place(parent, b[bStart++], ref)
    } else if (bEnd === bStart) {
      // Only removals left.
      while (aStart < aEnd) {
        const n = a[aStart++]
        if (!map?.has(n) && n.parentNode === parent) detach(parent, n)
      }
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      // The first and last nodes swapped places.
      const ref = a[--aEnd].nextSibling
      place(parent, b[bStart++], a[aStart++].nextSibling)
      place(parent, b[--bEnd], ref)
      a[aEnd] = b[bEnd]
    } else {
      if (!map) {
        map = new Map()
        for (let i = bStart; i < bEnd; i++) map.set(b[i], i)
      }
      const index = map.get(a[aStart])
      if (index == null) {
        // Not in `b` any more.
        detach(parent, a[aStart++])
      } else if (bStart < index && index < bEnd) {
        // How many nodes from a[aStart] on are already in `b`'s order?
        let i = aStart
        let sequence = 1
        while (++i < aEnd && i < bEnd) {
          const t = map.get(a[i])
          if (t == null || t !== index + sequence) break
          sequence++
        }
        if (sequence > index - bStart) {
          // A long run stays in place: insert the nodes `b` wants before it.
          const ref = a[aStart]
          while (bStart < index) place(parent, b[bStart++], ref)
        } else {
          // Put b's node where a[aStart] is. a[aStart] is still in `b` further on and is moved
          // there later; it is not removed first, so that move keeps its state too.
          place(parent, b[bStart++], a[aStart++])
        }
      } else {
        aStart++
      }
    }
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
export function resolve(value: unknown, commit: (v: unknown) => void): void {
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

/**
 * Resolve a renderable value into a tracked list of nodes owned by the current owner (computations
 * it creates are disposed with that owner). Reading the returned accessor tracks changes.
 */
export function region(value: unknown): () => Node[] {
  const out = new State<Node[]>([], { equals: () => false })
  let ready = false
  let nodes: Node[] = []
  resolve(value, (v) => {
    const next: Node[] = []
    collect(v, next)
    nodes = next
    if (ready) out.set(next)
  })
  ready = true
  out.set(nodes)
  return () => out.get()
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
      const seen = isDev() ? new Set<unknown>() : null
      items.forEach((value, i) => {
        const k = key(value, i)
        if (seen) {
          if (seen.has(k)) warn(`duplicate key ${String(k)} in a list: rows with the same key may be reordered or reused unexpectedly`)
          seen.add(k)
        }
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

/** Attributes holding URLs, where a dynamic `javascript:` value would run code. */
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'cite', 'background', 'ping'])
// Browsers ignore leading control characters/spaces and tabs or newlines inside the scheme.
const JAVASCRIPT_URL = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i

/** True for a `javascript:` URL in a URL attribute. Static attributes written in a template are never checked. */
export function isUnsafeUrl(name: string, v: unknown): boolean {
  return URL_ATTRS.has(name.toLowerCase()) && typeof v === 'string' && JAVASCRIPT_URL.test(v)
}

function setAttr(el: Element, name: string, v: unknown, scope?: string) {
  if (isUnsafeUrl(name, v)) {
    console.error(`[lux] blocked a javascript: URL in ${name}=… on <${el.tagName.toLowerCase()}>`)
    el.removeAttribute(name)
  } else if (name === 'class') {
    let cls = classValue(v)
    if (scope) cls = cls ? `${cls} ${scope}` : scope
    if (!cls) el.removeAttribute('class')
    else if (el.getAttribute('class') !== cls) el.setAttribute('class', cls)
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
    if (key === 'children' || key === 'key' || key === 'ref') return
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

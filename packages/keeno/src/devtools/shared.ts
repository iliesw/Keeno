// Shared by the dev tools panel components (ui/*.kn): the API they read, the actions context,
// value formatting and diffing, and page geometry.
import { createContext, inject } from '../context'
import type { DevComponent, DevDetails, DevEvent, DevMessage, DevSignal, DevStats } from '../devtools'

export type { DevComponent, DevDetails, DevEvent, DevMessage, DevSignal, DevStats }

export interface Api {
  version: number
  components(): DevComponent[]
  details(id: number): DevDetails | null
  nodes(id: number): Node[]
  at(target: Node): number | null
  path(id: number): number[]
  stores(): DevSignal[]
  set(id: number, value: unknown): boolean
  undo(id: number): void
  redo(id: number): void
  log(): DevEvent[]
  clearLog(): void
  stats(): DevStats
  resetStats(): void
  subscribe(fn: (m: DevMessage) => void): () => void
  expose(id: number, log?: boolean): void
}


export type Tab = 'components' | 'timeline' | 'perf'

export interface Prefs {
  open: boolean
  tab: Tab
  width: number
  side: 'left' | 'right'
  flash: boolean
  split: number
}


export const DEFAULT_PREFS: Prefs = { open: false, tab: 'components', width: 420, side: 'right', flash: false, split: 0.45 }

/** The pseudo-row id of "Stores" in the tree. */
export const STORES = -1

/** The dev tools API installed by the runtime (devtools.ts). */
export function getApi(): Api {
  return (globalThis as any).__KEENO_DEVTOOLS__
}

/** What components deep in the panel can do: provided by Panel.kn. */
export interface Actions {
  api: Api
  select(id: number | null, reveal?: boolean): void
  toggle(id: number): void
  highlight(id: number | null): void
  highlightNodes(nodes: Node[], label: string): void
  scrollTo(id: number): void
  openFile(file: string): void
  startPicker(): void
  setSplit(fraction: number): void
  refresh(): void
}

export const ActionsContext = createContext<Actions | undefined>(undefined, 'keeno-devtools')

/** The panel's actions (in a `.kn` file, as a plain object: call it, don't read it like a state). */
export function useActions(): Actions {
  const a = inject(ActionsContext)
  if (!a) throw new Error('[keeno] dev tools component rendered outside the panel')
  return a
}

/** A row of the flattened component tree. */
export interface TreeRow {
  id: number
  name: string
  file: string | null
  depth: number
  hasKids: boolean
  collapsed: boolean
  updates: number
  errors: number
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** The bounding box of some DOM nodes, in viewport coordinates. */
export function rectOf(nodes: Node[]): Box | null {
  let l = Infinity
  let t = Infinity
  let r = -Infinity
  let b = -Infinity
  const range = document.createRange()
  for (const n of nodes) {
    let rect: DOMRect | null = null
    if (n.nodeType === 1) rect = (n as Element).getBoundingClientRect()
    else if (n.nodeType === 3 && n.textContent?.trim()) {
      range.selectNodeContents(n)
      rect = range.getBoundingClientRect()
    }
    if (!rect || (rect.width === 0 && rect.height === 0)) continue
    l = Math.min(l, rect.left)
    t = Math.min(t, rect.top)
    r = Math.max(r, rect.right)
    b = Math.max(b, rect.bottom)
  }
  return l === Infinity ? null : { left: l, top: t, width: r - l, height: b - t }
}

export function formatTime(ms: number): string {
  const s = ms / 1000
  return s < 60 ? `${s.toFixed(3)}s` : `${Math.floor(s / 60)}m${(s % 60).toFixed(1).padStart(4, '0')}s`
}

export function formatMs(n: number): string {
  return n < 1 ? `${(n * 1000).toFixed(0)}µs` : `${n.toFixed(1)}ms`
}

export const ICONS = {
  pick: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  flash: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  dock: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  log: '<path d="M4 6l5 6-5 6M12 18h8"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  rec: '<circle cx="12" cy="12" r="6" fill="currentColor"/>',
  revert: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
}

export type IconName = keyof typeof ICONS

// ---------------------------------------------------------------------------
// Value formatting

export const OBJECT_ENTRY_LIMIT = 100

export function typeName(v: object): string {
  if (Array.isArray(v)) return `Array(${v.length})`
  if (v instanceof Map) return `Map(${v.size})`
  if (v instanceof Set) return `Set(${v.size})`
  const proto = Object.getPrototypeOf(v)
  const ctor = proto?.constructor?.name
  return proto === null || ctor === 'Object' ? '' : ctor || 'Object'
}

export function isNodeLike(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && typeof (v as Node).nodeType === 'number' && typeof (v as Node).nodeName === 'string'
}

export function isSignalLike(v: unknown): boolean {
  return typeof v === 'object' && v !== null && typeof (v as any).peek === 'function' && typeof (v as any).onUpdate === 'function'
}

export function nodeLabel(n: Node): string {
  if (n.nodeType === 1) {
    const el = n as Element
    const id = el.id ? `#${el.id}` : ''
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).filter((c) => !c.startsWith('keeno-')).slice(0, 2).join('.')}` : ''
    return `<${el.tagName.toLowerCase()}${id}${cls === '.' ? '' : cls}>`
  }
  if (n.nodeType === 3) return `#text ${JSON.stringify((n.textContent ?? '').slice(0, 20))}`
  return n.nodeName
}

/** A one-line preview of any value. */
export function preview(v: unknown, depth = 0): string {
  switch (typeof v) {
    case 'string':
      return JSON.stringify(v.length > 60 && depth > 0 ? v.slice(0, 60) + '…' : v)
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(v) + (typeof v === 'bigint' ? 'n' : '')
    case 'undefined':
      return 'undefined'
    case 'symbol':
      return v.toString()
    case 'function':
      return `ƒ ${v.name || 'anonymous'}()`
  }
  if (v === null) return 'null'
  if (v instanceof Error) return `${v.name}: ${v.message}`
  if (v instanceof Date) return isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString()
  if (v instanceof RegExp) return String(v)
  if (isNodeLike(v)) return nodeLabel(v)
  if (isSignalLike(v)) {
    let inner = '…'
    try {
      inner = preview((v as any).peek(), depth + 1)
    } catch {
      inner = '⚠'
    }
    return `${(v as any)._name ?? 'signal'}(${inner})`
  }
  const obj = v as object
  if (depth > 1) return Array.isArray(obj) ? `[…${obj.length}]` : `{…}`
  if (Array.isArray(obj)) {
    const items = obj.slice(0, 5).map((x) => preview(x, depth + 1))
    return `[${items.join(', ')}${obj.length > 5 ? ', …' : ''}]`
  }
  if (obj instanceof Map) return `Map(${obj.size})`
  if (obj instanceof Set) return `Set(${obj.size})`
  const keys = Object.keys(obj)
  const body = keys.slice(0, 4).map((k) => `${k}: ${preview((obj as any)[k], depth + 1)}`)
  const name = typeName(obj)
  return `${name ? name + ' ' : ''}{${body.join(', ')}${keys.length > 4 ? ', …' : ''}}`
}

export function valueClass(v: unknown): string {
  if (v === null || v === undefined) return 'v-null'
  if (v instanceof Error) return 'v-err'
  switch (typeof v) {
    case 'string':
      return 'v-str'
    case 'number':
    case 'bigint':
      return 'v-num'
    case 'boolean':
      return 'v-bool'
    case 'function':
      return 'v-fn'
  }
  return 'v-obj'
}

export function entriesOf(v: object): [string, unknown][] {
  if (isSignalLike(v)) {
    try {
      return [['value', (v as any).peek()]]
    } catch (err) {
      return [['error', err]]
    }
  }
  if (Array.isArray(v)) return v.map((x, i) => [String(i), x])
  if (v instanceof Map) return [...v.entries()].map(([k, x]) => [preview(k, 2), x])
  if (v instanceof Set) return [...v.values()].map((x, i) => [String(i), x])
  if (v instanceof Error) return [['message', v.message], ['stack', v.stack]]
  return Object.keys(v).map((k) => {
    try {
      return [k, (v as any)[k]]
    } catch (err) {
      return [k, err]
    }
  })
}

export function expandable(v: unknown): v is object {
  return typeof v === 'object' && v !== null && !isNodeLike(v) && !(v instanceof Date) && !(v instanceof RegExp)
}


/** Parse what was typed in an editor, keeping the type of the current value where it is obvious. */
export function parseInput(raw: string, current: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof current === 'string') return { ok: true, value: raw }
  const text = raw.trim()
  if (typeof current === 'number' && text !== '' && !Number.isNaN(Number(text))) return { ok: true, value: Number(text) }
  if (text === 'undefined') return { ok: true, value: undefined }
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${(err as Error).message}` }
  }
}

export const ABSENT = Symbol('absent')
export interface Change {
  path: string
  old: unknown
  next: unknown
}

/** The leaf-level differences between two values (structural, for arrays and plain objects). */
export function diff(a: unknown, b: unknown, path: string, depth: number): Change[] {
  if (Object.is(a, b)) return []
  const plain = (v: unknown) => Array.isArray(v) || (typeof v === 'object' && v !== null && [Object.prototype, null].includes(Object.getPrototypeOf(v)))
  if (depth > 4 || !plain(a) || !plain(b) || Array.isArray(a) !== Array.isArray(b)) return [{ path, old: a, next: b }]
  const out: Change[] = []
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    // An item added or removed in the middle shifts everything after it: show it as one change.
    if (a.length !== bb.length) {
      const [long, short] = a.length > bb.length ? [a, bb] : [bb, a]
      let i = 0
      while (i < short.length && Object.is(long[i], short[i])) i++
      const n = long.length - short.length
      const rest = long.slice(i + n)
      if (rest.every((v, j) => Object.is(v, short[i + j]))) {
        for (let k = i; k < i + n && out.length < 4; k++) {
          out.push(a.length < bb.length ? { path: `${path}[${k}]`, old: ABSENT, next: bb[k] } : { path: `${path}[${k}]`, old: a[k], next: ABSENT })
        }
        return out
      }
      out.push({ path: `${path}.length`, old: a.length, next: bb.length })
    }
    for (let i = 0; i < Math.min(a.length, bb.length) && out.length < 4; i++) out.push(...diff(a[i], bb[i], `${path}[${i}]`, depth + 1))
    return out
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
    if (out.length >= 4) break
    const p = /^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`
    if (!(k in ao)) out.push({ path: p, old: ABSENT, next: bo[k] })
    else if (!(k in bo)) out.push({ path: p, old: ao[k], next: ABSENT })
    else out.push(...diff(ao[k], bo[k], p, depth + 1))
  }
  return out
}


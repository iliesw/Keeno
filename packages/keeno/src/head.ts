// <Head>: title, meta and link tags in document.head, from anywhere in the component tree.
// Each <Head> renders its children once (their attributes and text stay reactive). Tags that
// name the same thing (one `title`, one `meta` per name or property, one canonical link, one
// `base`) go to the <Head> created last, which is the deepest one: a page overrides its layout,
// and the layout's tags come back when the page unmounts.
import type { Children } from './component'
import { collect, getDocument, isServer, resolve } from './dom'
import { getOwner, onCleanup, untrack, type Owner } from './signal'

export interface HeadProps {
  /** `<title>`, `<meta>`, `<link>`, `<base>`, `<style>` and `<script>` elements. */
  children?: Children
}

/** One mounted <Head> and its elements. */
interface Instance {
  elements: Element[]
}

/** @internal What a server render collects: the <Head> instances and the response status. */
export interface ServerResponse {
  heads: Instance[]
  status?: number
  /** Islands rendered so far (each gets the next number). */
  islands?: number
}

/** @internal Key, in a server render's root owner context, of its `ServerResponse`. */
export const SERVER_RESPONSE = Symbol('keeno.response')

/** @internal The response of the server render running `owner`, if any. */
export function serverResponse(owner: Owner | null = getOwner()): ServerResponse | null {
  for (let o = owner; o; o = o.parent) {
    const r = o.context?.get(SERVER_RESPONSE)
    if (r) return r as ServerResponse
  }
  return null
}

/** Marks tags rendered by <Head> on the server, so the client replaces them instead of adding copies. */
const MARK = 'data-kn-head'

/** What a tag stands for: tags with the same key replace each other. `null`: tags that add up. */
function keyOf(el: Element): string | null {
  const tag = el.tagName.toLowerCase()
  if (tag === 'title' || tag === 'base') return tag
  if (tag === 'meta') {
    if (el.hasAttribute('charset')) return 'meta:charset'
    for (const a of ['name', 'property', 'http-equiv', 'itemprop']) {
      const v = el.getAttribute(a)
      if (v) return `meta:${a}:${v}`
    }
    return null
  }
  if (tag === 'link' && el.getAttribute('rel') === 'canonical') return 'link:canonical'
  return null
}

/** The elements to show: keyless ones, plus the last one for each key. */
function winners(instances: readonly Instance[]): Element[] {
  const byKey = new Map<string, Element>()
  for (const inst of instances) for (const el of inst.elements) {
    const key = keyOf(el)
    if (key) byKey.set(key, el)
  }
  const out: Element[] = []
  for (const inst of instances) for (const el of inst.elements) {
    const key = keyOf(el)
    if (!key || byKey.get(key) === el) out.push(el)
  }
  return out
}

/** @internal The head HTML of a server render. */
export function serverHead(response: ServerResponse): string {
  return winners(response.heads)
    .map((el) => {
      // linkedom writes <title> text unescaped, and `</title>` in it would end the tag.
      if (el.tagName.toLowerCase() === 'title') return `<title ${MARK}="">${escapeText(el.textContent ?? '')}</title>`
      el.setAttribute(MARK, '')
      return el.outerHTML
    })
    .join('')
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// Browser

const mounted: Instance[] = []
/** Tags already in the page (from index.html) hidden because a <Head> replaces them, by key. */
const hidden = new Map<string, Element>()
let started = false

function apply() {
  const head = getDocument().head
  if (!started) {
    started = true
    // Tags the server rendered: the client renders its own.
    for (const el of Array.from(head.querySelectorAll(`[${MARK}]`))) el.remove()
  }
  const show = new Set(winners(mounted))
  const keys = new Set<string>()
  for (const el of show) {
    const key = keyOf(el)
    if (key) keys.add(key)
  }
  // Static tags with a key a <Head> now provides go away until no <Head> provides it.
  for (const el of Array.from(head.children)) {
    if (managed.has(el)) continue
    const key = keyOf(el)
    if (key && keys.has(key) && !hidden.has(key)) {
      hidden.set(key, el)
      el.remove()
    }
  }
  for (const [key, el] of hidden) {
    if (keys.has(key)) continue
    hidden.delete(key)
    head.appendChild(el)
  }
  for (const inst of mounted) for (const el of inst.elements) {
    if (show.has(el)) {
      if (el.parentNode !== head) head.appendChild(el)
    } else el.remove()
  }
}

/** Elements rendered by a <Head> (not static tags from the page). */
const managed = new WeakSet<Element>()

/**
 * Put `<title>`, `<meta>` and `<link>` tags in the document head:
 * `<Head><title>{post.title}</title><meta name="description" content={post.summary} /></Head>`.
 * Their text and attributes update like any template. The deepest `<Head>` wins for tags that
 * name the same thing, and the tags are removed when the component unmounts. During server
 * rendering they are collected into `context.head` (see `renderToString`).
 */
export function Head(props: HeadProps): unknown {
  const inst: Instance = { elements: [] }
  const response = isServer() ? serverResponse() : null
  if (isServer()) {
    if (!response) return null
    response.heads.push(inst)
  } else {
    mounted.push(inst)
    onCleanup(() => {
      mounted.splice(mounted.indexOf(inst), 1)
      for (const el of inst.elements) el.remove()
      apply()
    })
  }
  untrack(() =>
    resolve(props.children?.(), (value) => {
      const nodes: Node[] = []
      collect(value, nodes)
      const elements = nodes.filter((n): n is Element => n.nodeType === 1)
      if (!response) {
        for (const el of inst.elements) if (!elements.includes(el)) el.remove()
        for (const el of elements) managed.add(el)
      }
      inst.elements = elements
      if (!response) apply()
    }),
  )
  return null
}

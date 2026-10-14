// Server-side rendering: render a component to an HTML string with a server DOM (linkedom).
// `init` and `update` callbacks don't run on the server; render-time code and templates do.
// renderToString waits for async deriveds and sends their values to the client; renderToStream
// sends the page right away and streams each <Loading> boundary's content once it is ready.
import { createComponent, type Component } from './component'
import { PORTAL_OUTLET } from './control'
import { SERVER_RESPONSE, serverHead, type ServerResponse } from './head'
import { insert, setDocument } from './dom'
import { Owner, flush, installAsyncRegistry, runWithOwner, type Derived, type LoadingBoundary } from './signal'
// @ts-ignore: this package is typed without Node's types; only the server loads this module.
import { AsyncLocalStorage as NodeAsyncLocalStorage } from 'node:async_hooks'
import { decode, encode } from './serialize'
import { SERVER_FN_PATH } from './server-fn'

let shared: Document | undefined

async function serverDocument(): Promise<Document> {
  if (shared) return shared
  let linkedom: typeof import('linkedom')
  try {
    linkedom = await import('linkedom')
  } catch {
    throw new Error('[keeno] renderToString() needs the "linkedom" package: bun add linkedom')
  }
  shared = linkedom.parseHTML('<!doctype html><html><head></head><body></body></html>').document as unknown as Document
  return shared
}

/**
 * Render `Comp` to HTML using `doc` to create nodes. Synchronous: what is pending at the end
 * (for example an `<Await>` promise or an async derived) is rendered in its pending state.
 */
export function renderToStringWith<P extends Record<string, any>>(doc: Document, Comp: Component<P>, props: P = {} as P): string {
  const root = new Owner(null)
  const container = doc.createElement('div')
  const portals = doc.createElement('div')
  ;(root.context ??= new Map()).set(PORTAL_OUTLET, portals)
  setDocument(doc)
  try {
    runWithOwner(root, () => insert(container, () => createComponent(Comp, props)))
    return container.innerHTML + portals.innerHTML
  } finally {
    root.dispose()
    setDocument(null)
  }
}

// Async renders keep the server document installed while they wait. They all use the shared
// document, so concurrent renders can overlap.
let activeRenders = 0

function acquire(doc: Document) {
  if (activeRenders++ === 0) setDocument(doc)
}

function release() {
  if (--activeRenders === 0) setDocument(null)
}

export interface RenderOptions {
  /**
   * Stop waiting for async deriveds after this many milliseconds (default 10 000). What is still
   * loading then renders its `<Loading>` fallback, and the browser fetches it again.
   */
  timeout?: number
  /**
   * Filled in by the render: `head`, the HTML of the `<Head>` tags (put it in the page's
   * `<head>`), and `status`, set when a router error page rendered (404, 500, ...). With
   * `renderToStream` they are ready when the first chunk arrives.
   */
  context?: RenderContext
}

export interface RenderContext {
  head?: string
  status?: number
}

/** One server render: its root owner, async deriveds and boundaries. */
class Render {
  root = new Owner(null)
  container: Element
  portals: Element
  asyncs: Derived<any>[] = []
  boundaries: LoadingBoundary[] = []
  /** Async deriveds whose value was already sent (streaming). */
  sent = new Set<Derived<any>>()
  removeRegistry: () => void
  response: ServerResponse = { heads: [] }

  constructor(doc: Document, Comp: Component<any>, props: Record<string, any>, streaming: boolean) {
    this.container = doc.createElement('div')
    this.portals = doc.createElement('div')
    ;(this.root.context ??= new Map()).set(PORTAL_OUTLET, this.portals)
    this.root.context.set(SERVER_RESPONSE, this.response)
    let nextBoundary = 0
    this.removeRegistry = installAsyncRegistry(this.root, {
      next: 0,
      peek: () => undefined,
      created: (d) => this.asyncs.push(d),
      boundary: streaming
        ? (b) => {
            b.id = nextBoundary++
            this.boundaries.push(b)
          }
        : undefined,
    })
    runWithOwner(this.root, () => insert(this.container, () => createComponent(Comp, props)))
    flush()
  }

  loading(): Derived<any>[] {
    return this.asyncs.filter((d) => !d.disposed && d._loading?.peek())
  }

  /** Wait until no async derived is loading, or `deadline`. Returns false on timeout. */
  async settle(deadline: number, onProgress?: () => void): Promise<boolean> {
    while (true) {
      flush()
      onProgress?.()
      const loading = this.loading()
      if (!loading.length) return true
      const left = deadline - Date.now()
      if (left <= 0) return false
      let timer: ReturnType<typeof setTimeout> | undefined
      const timedOut = await Promise.race([
        Promise.race(loading.map((d) => d._settled())).then(() => false),
        new Promise<boolean>((r) => (timer = setTimeout(() => r(true), left))),
      ])
      clearTimeout(timer)
      if (timedOut) return false
    }
  }

  /** The values of settled async deriveds not sent yet, as a `<script>` (or ''). */
  dataScript(): string {
    const data: Record<string, unknown> = {}
    let any = false
    for (const d of this.asyncs) {
      if (this.sent.has(d) || d.disposed || !d._ssr || !d._hasValue || d._error || d._loading?.peek()) continue
      this.sent.add(d)
      data[d._ssrId!] = d._value
      any = true
    }
    return any ? `<script type="application/json" data-keeno-data>${escapeJson(JSON.stringify(data))}</script>` : ''
  }

  /** Copy the head HTML and status into the caller's context. */
  fill(context: RenderContext | undefined) {
    if (!context) return
    context.head = serverHead(this.response)
    if (this.response.status != null) context.status = this.response.status
  }

  dispose() {
    this.removeRegistry()
    this.root.dispose()
  }
}

// `<` (for `</script>`) and the line separators U+2028 / U+2029.
const UNSAFE_IN_SCRIPT = new RegExp('[<' + String.fromCharCode(0x2028, 0x2029) + ']', 'g')

/** JSON that is safe inside a <script> element. */
function escapeJson(json: string): string {
  return json.replace(UNSAFE_IN_SCRIPT, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
}

/**
 * Render `Comp` to an HTML string on the server (Node, Bun or Deno). It waits for async deriveds
 * (see `timeout`) and includes their values, so `hydrate(Comp, element)` in the browser reuses
 * them instead of fetching again.
 */
export async function renderToString<P extends Record<string, any>>(
  Comp: Component<P>,
  props: P = {} as P,
  options: RenderOptions = {},
): Promise<string> {
  const doc = await serverDocument()
  acquire(doc)
  let render: Render | undefined
  try {
    render = new Render(doc, Comp, props, false)
    await render.settle(Date.now() + (options.timeout ?? 10_000))
    render.fill(options.context)
    return render.container.innerHTML + render.portals.innerHTML + render.dataScript()
  } finally {
    render?.dispose()
    release()
  }
}

// Moves a streamed boundary's content (a <template>) in place of its fallback, between the
// <!--kn-l:N--> and <!--/kn-l:N--> markers.
const SWAP_SCRIPT =
  '<script>window.$knl=function(i){var t=document.querySelector(\'template[data-kn-l="\'+i+\'"]\');' +
  'var f=function(p){for(var n=p.firstChild;n;n=n.nextSibling){if(n.nodeType===8&&n.data==="kn-l:"+i)return n;' +
  'var r=f(n);if(r)return r}},s=f(document);' +
  'if(!t||!s)return;var e=s.nextSibling;while(e&&!(e.nodeType===8&&e.data==="/kn-l:"+i)){var x=e.nextSibling;' +
  'e.parentNode.removeChild(e);e=x}s.parentNode.insertBefore(t.content,e);t.parentNode.removeChild(t)}</script>'

/**
 * Render `Comp` as a stream of HTML. The first chunk is the page with each waiting `<Loading>`
 * showing its fallback; each boundary's content follows as soon as its data is ready, and the
 * browser swaps it in before your client script runs. Put the chunks inside your app's container
 * element, and load the client entry with `<script type="module">` so `hydrate` runs after the
 * stream ends.
 */
export function renderToStream<P extends Record<string, any>>(
  Comp: Component<P>,
  props: P = {} as P,
  options: RenderOptions = {},
): ReadableStream<string> {
  let render: Render | undefined
  let released = false
  const done = () => {
    if (released) return
    released = true
    render?.dispose()
    release()
  }
  return new ReadableStream<string>({
    async start(controller) {
      const doc = await serverDocument()
      acquire(doc)
      try {
        render = new Render(doc, Comp, props, true)
        const r = render
        // Boundaries showing their fallback in the HTML sent so far.
        const open = new Set(r.boundaries.filter((b) => b.waiting() > 0))
        r.fill(options.context)
        controller.enqueue(r.container.innerHTML + r.portals.innerHTML + r.dataScript() + (open.size ? SWAP_SCRIPT : ''))
        const sendReady = () => {
          for (const b of r.boundaries) {
            if (!open.has(b) || b.waiting() > 0) continue
            // Inside a boundary that is still open: it goes out with that one.
            let p = b.parent
            while (p && !open.has(p)) p = p.parent
            if (p) continue
            open.delete(b)
            const html = b
              .content()
              .map((n) => (n as Element).outerHTML ?? (n.nodeType === 3 ? escapeText(n.textContent ?? '') : n.nodeType === 8 ? `<!--${(n as Comment).data}-->` : ''))
              .join('')
            // Boundaries inside it: ready ones go out in this HTML, waiting ones show their fallback in it.
            for (const inner of r.boundaries) {
              if (!isInside(inner, b)) continue
              if (inner.waiting() > 0) open.add(inner)
              else open.delete(inner)
            }
            controller.enqueue(`${r.dataScript()}<template data-kn-l="${b.id}">${html}</template><script>$knl("${b.id}")</script>`)
          }
        }
        if (open.size) await r.settle(Date.now() + (options.timeout ?? 10_000), sendReady)
        // Values read outside any streamed boundary, for hydration.
        const rest = r.dataScript()
        if (rest) controller.enqueue(rest)
        controller.close()
      } catch (err) {
        controller.error(err)
      } finally {
        done()
      }
    },
    cancel() {
      done()
    },
  })
}

function isInside(b: LoadingBoundary, ancestor: LoadingBoundary): boolean {
  for (let p = b.parent; p; p = p.parent) if (p === ancestor) return true
  return false
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// Server functions

interface RequestScope {
  request: Request
  headers: Headers
}

const requests: { getStore(): RequestScope | undefined; run<T>(store: RequestScope, fn: () => T): T } = new NodeAsyncLocalStorage()

/**
 * The request being handled: in a server function, or while a page renders on the server. Throws
 * anywhere else.
 */
export function getRequest(): Request {
  const scope = requests.getStore()
  if (!scope) throw new Error('[keeno] getRequest() only works in a server function or a server render')
  return scope.request
}

/** Add a header to the response of the server function being called: `setHeader('set-cookie', …)`. */
export function setHeader(name: string, value: string): void {
  const scope = requests.getStore()
  if (!scope) throw new Error('[keeno] setHeader() only works in a server function')
  scope.headers.append(name, value)
}

/** @internal Run `fn` with `request` as the one `getRequest()` returns. */
export function withRequest<T>(request: Request, fn: () => T, headers: Headers = new Headers()): T {
  return requests.run({ request, headers }, fn)
}

/** A module's server functions by index (`$$serverFns`), loaded on demand, by module id. */
export type ServerFunctionModules = Record<string, () => Promise<{ $$serverFns?: Record<string, unknown> }>>

export interface ServerFunctionOptions {
  /** The app's base path (default `/`). */
  base?: string
  /** Development: send error messages and stacks to the browser. */
  dev?: boolean
}

const statusOf = (error: unknown): number => {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' && status >= 100 && status <= 599 ? status : 500
}

const json = (status: number, body: unknown, headers: Headers = new Headers()) => {
  headers.set('content-type', 'application/json')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(encode(body)), { status, headers })
}

/**
 * @internal Answer a call to a server function (`POST {base}_keeno/fn/<module>/<index>`), or
 * return null when `request` isn't one.
 */
export async function handleServerFunction(
  request: Request,
  modules: ServerFunctionModules,
  options: ServerFunctionOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url)
  const prefix = (options.base ?? '/') + SERVER_FN_PATH
  if (!url.pathname.startsWith(prefix)) return null
  if (request.method !== 'POST') return json(405, { message: 'Server functions are called with POST' })
  // Only the app's own pages call them: a form or script on another site can't.
  const origin = request.headers.get('origin')
  if (request.headers.get('x-keeno-fn') !== '1' || (origin && origin !== url.origin)) return json(403, { message: 'Forbidden' })

  const [moduleId, index, extra] = url.pathname.slice(prefix.length).split('/')
  const load = moduleId && !extra && Object.hasOwn(modules, moduleId) ? modules[moduleId] : undefined
  const fns = load ? (await load()).$$serverFns : undefined
  const fn = fns && index && Object.hasOwn(fns, index) ? fns[index] : undefined
  if (typeof fn !== 'function') return json(404, { message: 'No such server function' })

  let args: unknown[]
  try {
    const type = request.headers.get('content-type') ?? ''
    if (type.startsWith('multipart/form-data') || type.startsWith('application/x-www-form-urlencoded')) args = [await request.formData()]
    else {
      const text = await request.text()
      args = text ? (decode(JSON.parse(text)) as unknown[]) : []
      if (!Array.isArray(args)) throw new Error('not an array')
    }
  } catch {
    return json(400, { message: 'Invalid arguments' })
  }

  const headers = new Headers()
  try {
    const result = await withRequest(request, () => fn(...args), headers)
    return json(200, result, headers)
  } catch (error) {
    const status = statusOf(error)
    if (status >= 500) console.error(error)
    const message = error instanceof Error ? error.message : String(error)
    return json(
      status,
      options.dev
        ? { message, stack: error instanceof Error ? error.stack : undefined }
        : { message: status >= 500 ? 'Internal Server Error' : message },
      headers,
    )
  }
}

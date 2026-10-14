// Client-side router for Keeno: <Router>, <Link>, the `link` click handler, navigate() and useRoute().
import { ErrorBoundary, State, createContext, derived, flush, inject, lazy, provide, untrack, type Children, type Component } from '@inflector/keeno'
import { attr, callerScope, createComponent, insert, on, serverResponse, template } from '@inflector/keeno/internal'

export type Params = Record<string, string>

/** Props passed to a route's component. */
export interface RouteProps {
  /** Path parameters (`/users/:id` → `{ id }`); updates in place when only they change. */
  params: Params
}

export interface RouteDefinition {
  /**
   * `/users/:id` matches one segment per `:name`; a final `*` (or `*name`) matches the rest of the
   * path (`params['*']` or `params.name`). Routes are tried in order: put specific ones first.
   */
  path: string
  /** Receives `RouteProps`. Typed loosely so components can declare their own params type. */
  component: Component<any>
  /**
   * Layouts around the component, outermost first. Each receives `params` and `children`. A layout
   * is kept while the routes navigated between share it at the same depth.
   */
  layouts?: Component<any>[]
  /**
   * Pages for errors thrown while the component renders, by HTTP status (`httpError(404)`, other
   * errors are 500). Each receives `ErrorPageProps` and renders inside the route's layouts.
   */
  errors?: Record<number, Component<any>>
}

/** Props passed to a layout. */
export interface LayoutProps extends RouteProps {
  children: Children
}

/** Props passed to an error page (`_404.kn`, `_500.kn`, ...). */
export interface ErrorPageProps extends RouteProps {
  status: number
  /** What was thrown: an `HttpError` for `httpError()`, anything else for a 500. */
  error: unknown
  /** Render the page again. */
  reset: () => void
}

/** An error carrying an HTTP status: throw it from a page to show that status's error page. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`)
    this.name = 'HttpError'
  }
}

/** `throw httpError(403)` renders the route's 403 page (`_403.kn`). */
export function httpError(status: number, message?: string): HttpError {
  return new HttpError(status, message)
}

/** The HTTP status of a thrown value: its numeric `status`, else 500. */
export function errorStatus(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' && status >= 100 && status <= 599 ? status : 500
}

/** The current route. Its fields are reactive: reading them in a template or `update` tracks them. */
export interface Route {
  /** Path without the router's `base`, e.g. `/users/1`. */
  readonly path: string
  readonly params: Params
  readonly query: URLSearchParams
  /** Including the `#`, or ''. */
  readonly hash: string
  /** The matched route definition, or null. */
  readonly matched: RouteDefinition | null
}

interface Loc {
  pathname: string
  search: string
  hash: string
}

// ---------------------------------------------------------------------------
// Location

const hasWindow = typeof window !== 'undefined' && typeof location !== 'undefined'

function readLocation(): Loc {
  if (!hasWindow) return { pathname: '/', search: '', hash: '' }
  return { pathname: location.pathname, search: location.search, hash: location.hash }
}

function parseUrl(url: string): Loc {
  const u = new URL(url, 'http://localhost')
  return { pathname: u.pathname, search: u.search, hash: u.hash }
}

const current = new State<Loc>(readLocation(), {
  equals: (a, b) => a.pathname === b.pathname && a.search === b.search && a.hash === b.hash,
})
let listening = false
/** The `base` of the browser's <Router>. A state, so links rendered before the router follow it. */
const base = new State('')

// Scroll positions of the history entries visited in this document, by URL. The router restores
// them on back/forward itself: the browser would scroll before the new route has rendered.
const scrollPositions = new Map<string, [number, number]>()
const locKey = (l: Loc) => l.pathname + l.search + l.hash

function saveScroll(l: Loc) {
  if (typeof window.scrollY === 'number') scrollPositions.set(locKey(l), [window.scrollX, window.scrollY])
}

function setScrollRestoration(mode: 'auto' | 'manual') {
  try {
    if ('scrollRestoration' in history) history.scrollRestoration = mode
  } catch {
    // not supported
  }
}

/** After back/forward: the saved position, else the `#hash` target, else the top. */
function restoreScroll(l: Loc) {
  const saved = scrollPositions.get(locKey(l))
  if (!saved && l.hash) return scrollToHash(l.hash)
  const run = () => {
    try {
      window.scrollTo(saved?.[0] ?? 0, saved?.[1] ?? 0)
    } catch {
      // not implemented (test DOMs)
    }
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else setTimeout(run, 0)
}

/** Whether navigations animate with the View Transitions API (`<Router viewTransition>`). */
let transitionsDefault = false

/**
 * Run `update` (which changes the location and scrolls) inside `document.startViewTransition`,
 * flushing so the new page is rendered before the browser takes its snapshot. Without the API,
 * `update` just runs.
 */
function withTransition(enabled: boolean, update: () => void) {
  const start = enabled && hasWindow ? (document as any).startViewTransition : undefined
  if (typeof start !== 'function') return update()
  start.call(document, () => {
    update()
    flush()
  })
}

function scrollTo(x: number, y: number) {
  try {
    window.scrollTo(x, y)
  } catch {
    // not implemented (test DOMs)
  }
}

/** Start following the browser location, and pick up changes made without `navigate()`. */
function sync() {
  if (!hasWindow) return
  current.set(readLocation())
  if (listening) return
  listening = true
  window.addEventListener('popstate', () => {
    saveScroll(current.peek())
    const next = readLocation()
    if (transitionsDefault && typeof (document as any).startViewTransition === 'function') {
      // Scroll inside the transition, so the new snapshot has the restored position.
      withTransition(true, () => {
        current.set(next)
        flush()
        const saved = scrollPositions.get(locKey(next))
        if (!saved && next.hash) scrollToHash(next.hash)
        else scrollTo(saved?.[0] ?? 0, saved?.[1] ?? 0)
      })
      return
    }
    current.set(next)
    restoreScroll(next)
  })
  setScrollRestoration('manual')
  // Leaving the document (reload, another site): let the browser restore this entry natively.
  window.addEventListener('pagehide', () => setScrollRestoration('auto'))
  window.addEventListener('pageshow', () => setScrollRestoration('manual'))
}

function normalizeBase(b: string | undefined): string {
  if (!b || b === '/') return ''
  return '/' + b.replace(/^\/+|\/+$/g, '')
}

/** True if `pathname` is the app at `b` or below it. */
function underBase(pathname: string, b: string): boolean {
  return !b || pathname === b || pathname.startsWith(b + '/')
}

function stripBase(pathname: string, b: string): string {
  if (!b) return pathname
  if (pathname === b) return '/'
  return pathname.startsWith(b + '/') ? pathname.slice(b.length) : pathname
}

function withBase(b: string, path: string): string {
  // `//host` would be a URL to another site: an app path always has a single leading slash.
  return path.startsWith('/') ? b + '/' + path.replace(/^\/+/, '') : path
}

/** The URL for an app path, with the router's `base` in front: `href('/users/1')`. */
export function href(path: string): string {
  return withBase(base.get(), path)
}

/** Scroll to the element a `#hash` names, once the new route has rendered. */
function scrollToHash(hash: string) {
  const id = decode(hash.slice(1))
  const run = () => {
    const el = id && document.getElementById(id)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView()
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
  else setTimeout(run, 0)
}

export interface NavigateOptions {
  /** Replace the current history entry instead of adding one. */
  replace?: boolean
  /** `history.state` for the new entry. */
  state?: unknown
  /** Scroll to the top after navigating (default true, unless the URL has a hash). */
  scroll?: boolean
  /**
   * Animate the change with the View Transitions API, where the browser supports it (default:
   * the `viewTransition` prop of `<Router>`). The new page renders inside the transition.
   */
  transition?: boolean
}

/** Go to an app path (`/users/1`, prefixed with `base`) or a relative URL (`?tab=2`). */
export function navigate(to: string, options: NavigateOptions = {}): void {
  if (!hasWindow) throw new Error('[keeno-router] navigate() only works in the browser')
  const url = new URL(href(to), location.href)
  if (url.origin !== location.origin) {
    location.assign(url.href)
    return
  }
  saveScroll(current.peek())
  if (options.replace) history.replaceState(options.state ?? null, '', url)
  else history.pushState(options.state ?? null, '', url)
  // Let everything that follows the URL (including `state(v, { url })`) see the change. Not a
  // `popstate`: other code would take that for a back/forward navigation.
  window.dispatchEvent(new CustomEvent('keeno:navigate', { detail: { url: url.href, state: options.state ?? null } }))
  withTransition(options.transition ?? transitionsDefault, () => {
    current.set(readLocation())
    if (options.scroll === false) return
    if (url.hash) scrollToHash(url.hash)
    else if (typeof window.scrollTo === 'function') scrollTo(0, 0)
  })
}

/** True when a click should be left to the browser (new tab, download, other site…). */
function isExternalClick(e: MouseEvent, a: HTMLAnchorElement): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return true
  if ((a.target && a.target !== '_self') || a.hasAttribute('download')) return true
  const url = new URL(a.href, location.href)
  return url.origin !== location.origin
}

/**
 * Click handler for your own `<a>` elements: `<a href="/about" onClick={link}>About</a>`. With a
 * `base`, write `href={href('/about')}`.
 */
export function link(e: MouseEvent): void {
  const a = (e.currentTarget as Element | null)?.closest('a') as HTMLAnchorElement | null
  if (!a || isExternalClick(e, a)) return
  const url = new URL(a.href, location.href)
  // Outside the app's base: another app on this origin, so a normal page load.
  if (!underBase(url.pathname, base.peek())) return
  e.preventDefault()
  navigate(stripBase(url.pathname, base.peek()) + url.search + url.hash, {
    replace: a.hasAttribute('data-replace'),
    transition: a.hasAttribute('data-transition') ? a.getAttribute('data-transition') !== 'false' : undefined,
  })
}

// ---------------------------------------------------------------------------
// Matching

interface Compiled {
  segments: string[]
  rest: string | null
}

const compiled = new WeakMap<RouteDefinition, Compiled>()

function compile(route: RouteDefinition): Compiled {
  let c = compiled.get(route)
  if (c) return c
  const segments = route.path.split('/').filter(Boolean)
  let rest: string | null = null
  const last = segments[segments.length - 1]
  if (last?.startsWith('*')) {
    rest = last.slice(1) || '*'
    segments.pop()
  }
  compiled.set(route, (c = { segments, rest }))
  return c
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Match `path` against a route pattern; returns its params, or null. */
export function matchPath(pattern: string | RouteDefinition, path: string): Params | null {
  const { segments, rest } = compile(typeof pattern === 'string' ? { path: pattern, component: () => null } : pattern)
  const parts = path.split('/').filter(Boolean)
  if (rest === null ? parts.length !== segments.length : parts.length < segments.length) return null
  const params: Params = {}
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.startsWith(':')) params[seg.slice(1)] = decode(parts[i])
    else if (seg !== parts[i]) return null
  }
  if (rest !== null) params[rest] = parts.slice(segments.length).map(decode).join('/')
  return params
}

// ---------------------------------------------------------------------------
// Router

const RouteContext = createContext<Route | null>(null, 'route')
/** The `base` of the closest <Router>: on the server, links can't use the shared browser one. */
const BaseContext = createContext<string | null>(null, 'route-base')

function pathIsActive(here: string, path: string, exact: boolean): boolean {
  if (here === path) return true
  if (exact || path === '/') return false
  return here.startsWith(path.endsWith('/') ? path : path + '/')
}

/** True if the browser's current path is `path` or below it (`exact`: only `path` itself). Tracked. */
export function isActive(path: string, exact = false): boolean {
  return pathIsActive(stripBase(current.get().pathname, base.get()), path, exact)
}

export interface RouterProps {
  routes: RouteDefinition[]
  /** Path prefix the app is served under, e.g. `/app`. */
  base?: string
  /** Server rendering: the request URL to render, instead of the browser location. */
  url?: string
  /** Rendered when no route matches. */
  fallback?: () => unknown
  /**
   * Animate navigations (links, `navigate()`, back and forward) with the View Transitions API,
   * where the browser supports it. A navigation can opt out with `transition: false`.
   */
  viewTransition?: boolean
}

/**
 * Render the component of the first route matching the URL. The component is kept when only
 * the params change, and replaced when another route matches.
 */
export function Router(props: RouterProps): unknown {
  const routerBase = normalizeBase(untrack(() => props.base))
  const url = untrack(() => props.url)
  const loc = url != null ? new State(parseUrl(url)) : current
  if (url == null) {
    base.set(routerBase)
    transitionsDefault = !!untrack(() => props.viewTransition)
    sync()
  }
  // URLs outside the base aren't this app's: they match nothing.
  const outside = (l: Loc) => !underBase(l.pathname, routerBase)
  const info = derived(() => {
    const l = loc.get()
    const path = stripBase(l.pathname, routerBase)
    if (outside(l)) return { l, path, matched: null, params: {} as Params }
    for (const r of props.routes) {
      const params = matchPath(r, path)
      if (params) return { l, path, matched: r, params }
    }
    return { l, path, matched: null, params: {} as Params }
  })
  const matched = derived(() => info.get().matched)
  const route: Route = {
    get path() {
      return info.get().path
    },
    get params() {
      return info.get().params
    },
    get query() {
      return new URLSearchParams(info.get().l.search)
    },
    get hash() {
      return info.get().l.hash
    },
    get matched() {
      return matched.get()
    },
  }
  provide(RouteContext, route)
  provide(BaseContext, routerBase)

  /** Props for the components of a route: `params` stays a getter, so it follows navigation. */
  const withParams = <T extends object>(extra: T): T & RouteProps =>
    Object.defineProperty(extra, 'params', { get: () => info.get().params, enumerable: true }) as T & RouteProps
  // What renders at each depth: the route's layouts, then the route itself. A depth keeps its
  // instance while its entry stays the same, so shared layouts survive navigation.
  const chain = derived(() => {
    const r = matched.get()
    return r ? [...(r.layouts ?? []), r] : []
  })
  const depth = untrack(() => Math.max(1, ...props.routes.map((r) => (r.layouts?.length ?? 0) + 1)))
  const levels: (() => unknown)[] = []
  for (let i = 0; i < depth; i++) {
    const entry = derived(() => chain.get()[i] as Component<any> | RouteDefinition | undefined)
    levels.push(() => {
      const e = entry.get()
      if (!e) return null
      if (typeof e === 'function') return untrack(() => createComponent(e, withParams({ children: levels[i + 1] })))
      return untrack(() => renderPage(e))
    })
  }

  // A route with error pages renders inside an ErrorBoundary, reset when the path changes.
  let resetError: (() => void) | null = null
  derived(() => info.get().path).onUpdate(() => {
    const reset = resetError
    resetError = null
    reset?.()
  })
  const renderPage = (r: RouteDefinition) => {
    const page = () => createComponent(r.component, withParams({}))
    const errors = r.errors
    if (!errors || !Object.keys(errors).length) return page()
    return createComponent(ErrorBoundary, {
      children: page,
      fallback: (error: unknown, reset: () => void) => {
        const status = errorStatus(error)
        const ErrorPage = errors[status]
        if (!ErrorPage) throw error
        const response = serverResponse()
        if (response) response.status = status
        resetError = reset
        return createComponent(
          ErrorPage,
          withParams({
            status,
            error,
            reset: () => {
              resetError = null
              reset()
            },
          }),
        )
      },
    })
  }

  const found = derived(() => !!matched.get())
  const response = serverResponse()
  return () => {
    if (!found.get()) {
      if (response) response.status = 404
      return props.fallback ? untrack(props.fallback) : null
    }
    return levels[0]()
  }
}

/** The current route of the closest `<Router>` (call it while the component is created). */
export function useRoute(): Route {
  const route = inject(RouteContext)
  if (!route) throw new Error('[keeno-router] useRoute() must be called inside a <Router>')
  return route
}

// ---------------------------------------------------------------------------
// Link

export interface LinkProps {
  /** App path (`/users/1`) or relative URL. */
  href: string
  /** Replace the current history entry. */
  replace?: boolean
  /** Animate the navigation with the View Transitions API (default: `<Router viewTransition>`). */
  transition?: boolean
  /** Class added while the link's path is active (default `active`). */
  activeClass?: string
  /** Only active on exactly this path, not below it. */
  exact?: boolean
  class?: unknown
  children?: Children
}

const anchor = template('<a></a>')

/**
 * A link that navigates without reloading the page, with `aria-current="page"` and `activeClass`
 * while active. The scoped styles of the component that renders it apply to its `<a>`.
 */
export function Link(props: LinkProps): unknown {
  const a = anchor() as HTMLAnchorElement
  const scope = callerScope()
  // Inside a <Router>, follow its location (which is the request URL when rendering on the server).
  const route = inject(RouteContext)
  const routerBase = inject(BaseContext)
  if (!route) sync()
  const active = derived(() => {
    const path = props.href.split(/[?#]/)[0]
    return route ? pathIsActive(route.path, path, !!props.exact) : isActive(path, props.exact)
  })
  attr(a, 'href', () => withBase(routerBase ?? base.get(), props.href))
  attr(a, 'class', () => [props.class, active.get() && (props.activeClass ?? 'active')], scope ?? undefined)
  attr(a, 'aria-current', () => (active.get() ? 'page' : null))
  on(a, 'click', (e: MouseEvent) => {
    if (isExternalClick(e, a)) return
    e.preventDefault()
    navigate(props.href, { replace: props.replace, transition: props.transition })
  })
  insert(a, () => props.children?.())
  return a
}

// ---------------------------------------------------------------------------
// File routes

/** A page module: loaded (`{ default }`) or a loader (`() => import('./page.kn')`). */
export type PageModule = { default: Component<any> } | (() => Promise<{ default: Component<any> }>)

interface Dir {
  path: string[]
  layout?: Component<any>
  errors: Record<number, Component<any>>
}

const ERROR_FILE = /^_([1-5]\d\d)$/

/** `[id]` → `:id`, `[...rest]` → `*rest`; other names stay as they are. */
function fileSegment(name: string): string {
  const m = /^\[(\.\.\.)?([^\]]+)\]$/.exec(name)
  return m ? (m[1] ? '*' : ':') + m[2] : name
}

/** Order routes from most to least specific: static, `:param`, end of path, then `*`. */
function rank(seg: string | undefined): number {
  if (seg === undefined) return 1
  if (seg.startsWith('*')) return 0
  return seg.startsWith(':') ? 2 : 3
}

function compareRoutes(a: string, b: string): number {
  const sa = a.split('/').filter(Boolean)
  const sb = b.split('/').filter(Boolean)
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const d = rank(sb[i]) - rank(sa[i])
    if (d) return d
  }
  return 0
}

function notFound(): never {
  throw new HttpError(404, 'Not found')
}

/**
 * Routes from a directory of page files, as `import.meta.glob('/src/pages/**\/*.kn')` returns it
 * (keys starting with `dir`):
 *
 * - `index.kn` is the directory's path, `about.kn` is `/about`, `[id].kn` is `/:id`.
 * - `_layout.kn` wraps every page of its directory and the ones below it.
 * - `_all.kn` matches every path below its directory that no other page does (`params['*']`).
 * - `_404.kn` renders for paths below its directory that match nothing, and `_500.kn`, `_403.kn`…
 *   for errors with that status thrown by a page (`throw httpError(403)`; other errors are 500).
 * - Other files starting with `_` are left out, so pages can keep their own components next to them.
 */
export function pageRoutes(files: Record<string, PageModule>, dir = ''): RouteDefinition[] {
  const prefix = dir.replace(/\/+$/, '') + '/'
  const dirs = new Map<string, Dir>()
  const getDir = (key: string): Dir => {
    let d = dirs.get(key)
    if (!d) dirs.set(key, (d = { path: key ? key.split('/').map(fileSegment) : [], errors: {} }))
    return d
  }
  const pages: { dir: string; path: string[]; component: Component<any> }[] = []
  const component = (m: PageModule) => (typeof m === 'function' ? lazy(m) : m.default)

  for (const file of Object.keys(files).sort()) {
    if (!file.startsWith(prefix) || !file.endsWith('.kn')) continue
    const parts = file.slice(prefix.length, -'.kn'.length).split('/')
    const name = parts.pop()!
    if (parts.some((p) => p.startsWith('_'))) continue
    const key = parts.join('/')
    const d = getDir(key)
    const mod = files[file]
    const error = ERROR_FILE.exec(name)
    if (name === '_layout') d.layout = component(mod)
    else if (error) d.errors[+error[1]] = component(mod)
    else if (name === '_all') pages.push({ dir: key, path: [...d.path, '*'], component: component(mod) })
    else if (name === 'index') pages.push({ dir: key, path: d.path, component: component(mod) })
    else if (!name.startsWith('_')) pages.push({ dir: key, path: [...d.path, fileSegment(name)], component: component(mod) })
  }

  /** The directories from the root down to `key`. */
  const ancestors = (key: string): Dir[] => {
    const parts = key ? key.split('/') : []
    return [getDir(''), ...parts.map((_, i) => getDir(parts.slice(0, i + 1).join('/')))]
  }
  const scope = (key: string) => {
    const chain = ancestors(key)
    return {
      layouts: chain.flatMap((d) => (d.layout ? [d.layout] : [])),
      errors: Object.assign({}, ...chain.map((d) => d.errors)) as Record<number, Component<any>>,
    }
  }

  const routes: (RouteDefinition & { fallback?: boolean })[] = pages.map((p) => ({
    path: '/' + p.path.join('/'),
    component: p.component,
    ...scope(p.dir),
  }))
  // A directory's 404 page catches the paths below it that no page matches.
  for (const [key, d] of [...dirs]) {
    if (d.errors[404]) routes.push({ path: '/' + [...d.path, '*'].join('/'), component: notFound, fallback: true, ...scope(key) })
  }
  return routes
    .map((r, i) => ({ r, i }))
    .sort((a, b) => compareRoutes(a.r.path, b.r.path) || Number(!!a.r.fallback) - Number(!!b.r.fallback) || a.i - b.i)
    .map(({ r: { fallback, ...r } }) => r)
}

/**
 * Load the page that matches `url` (an app path or full URL), if it loads on demand. Await it
 * before `renderToString` or `hydrate`, so the page renders in the first pass.
 */
export async function preloadRoute(routes: RouteDefinition[], url: string): Promise<void> {
  const path = parseUrl(url).pathname
  const route = routes.find((r) => matchPath(r, path))
  await (route?.component as { preload?: () => Promise<unknown> } | undefined)?.preload?.()
}

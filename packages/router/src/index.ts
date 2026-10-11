// Client-side router for Keeno: <Router>, <Link>, the `link` click handler, navigate() and useRoute().
import { State, createContext, derived, inject, provide, untrack, type Children, type Component } from '@inflector/keeno'
import { attr, callerScope, createComponent, insert, on, template } from '@inflector/keeno/internal'

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

/** Start following the browser location, and pick up changes made without `navigate()`. */
function sync() {
  if (!hasWindow) return
  current.set(readLocation())
  if (listening) return
  listening = true
  window.addEventListener('popstate', () => {
    saveScroll(current.peek())
    const next = readLocation()
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
  current.set(readLocation())
  if (options.scroll === false) return
  if (url.hash) scrollToHash(url.hash)
  else if (typeof window.scrollTo === 'function') {
    try {
      window.scrollTo(0, 0)
    } catch {
      // not implemented (test DOMs)
    }
  }
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
  navigate(stripBase(url.pathname, base.peek()) + url.search + url.hash, { replace: a.hasAttribute('data-replace') })
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
  return () => {
    const r = matched.get()
    if (!r) return props.fallback ? untrack(props.fallback) : null
    return untrack(() =>
      createComponent(r.component, {
        get params() {
          return info.get().params
        },
      }),
    )
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
    navigate(props.href, { replace: props.replace })
  })
  insert(a, () => props.children?.())
  return a
}

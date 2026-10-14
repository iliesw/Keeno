# Routing

`@inflector/keeno-router` is a small client-side router built on the History API. It comes with the Vite plugin (`@inflector/vite-plugin-keeno`), so with Vite there is nothing more to install: import from `@inflector/keeno-router` and the plugin resolves it. Install it yourself (`bun add @inflector/keeno-router`) to pin its version, or to use it without the plugin.

The quickest way to use it is [file-based routing](file-routing.md), as `examples/todo` does.

## Routes

```html App.kn
<script lang="ts">
  import { lazy } from '@inflector/keeno'
  import { Link, Router, type RouteDefinition } from '@inflector/keeno-router'
  import Home from './Home.kn'
  import User from './User.kn'
  import NotFound from './NotFound.kn'

  const routes: RouteDefinition[] = [
    { path: '/', component: Home },
    { path: '/users/:id', component: User },
    { path: '/settings', component: lazy(() => import('./Settings.kn')) },
    { path: '*', component: NotFound },
  ]
</script>

<nav>
  <Link href="/" exact>Home</Link>
  <Link href="/users/1">Ada</Link>
  <Link href="/settings">Settings</Link>
</nav>
<Router routes={routes} />
```

- Routes are tried in order and the first match wins, so put specific paths before general ones and `*` last.
- `:name` matches one path segment. A final `*` matches the rest of the path, as `params['*']`, and `*name` names it, as `params.name`. Trailing slashes are ignored and params are URL-decoded.
- `<Router>` keeps the component when only the params change, so `/users/1` → `/users/2` updates `params` in place. It creates a new instance when a different route matches.
- `fallback={() => …}` renders when nothing matches, if you don't want a `*` route.
- `base="/app"` serves the app under a path prefix. Route paths, `<Link href>` and `navigate()` then use paths without the prefix.

## Route components

A route component receives `params`:

```html User.kn
<script lang="ts">
  import { useRoute } from '@inflector/keeno-router'
  const { params } = props<{ params: { id: string } }>()
  const route = useRoute()
</script>

<h1>User {params.id}</h1>
<p>Tab: {route.query.get('tab') ?? 'overview'}</p>
```

`useRoute()` gives the current route anywhere inside `<Router>`: `path`, `params`, `query` (a `URLSearchParams`), `hash` and `matched` (the route definition). Its fields are reactive, so templates and `update()` follow navigation.

## Navigation

- `<Link href="/users/1">` renders an `<a>` that navigates without reloading. While its path is active, it gets the class `active` (change it with `activeClass`) and `aria-current="page"`. A link is active on its own path and on the paths below it, and `exact` limits it to its own path. `replace` replaces the history entry instead of adding one.
- The scoped styles of the component that renders a `<Link>` apply to its `<a>`: `a { … }` and `.active { … }` in that component's `<style>` reach it.
- To write your own anchor, use the `link` click handler: `<a href="/about" onClick={link}>About</a>`. With a `base`, write `href={href('/about')}`. `isActive('/about')` tells you whether to mark it.
- `navigate('/users/2')` navigates from code. `navigate('/login', { replace: true })` replaces the current entry, and `{ scroll: false }` keeps the scroll position. A URL with a `#hash` scrolls to that element instead of the top. On back/forward, the router restores the scroll position the page had, once the route has rendered. Relative URLs such as `navigate('?tab=2')` work too.
- Clicks with a modifier key, a middle click, `target="_blank"`, `download` and links to other sites are left to the browser.
- Query parameters synced with `state(v, { url: 'tab' })` follow navigation, including back and forward.

## Loading data

Give a route a `load` function and its component receives what it returns as `data`:

```ts
const routes: RouteDefinition[] = [
  {
    path: '/users/:id',
    component: lazy(() => import('./User.kn')),
    load: async ({ params, signal }) => {
      const res = await fetch(`/api/users/${params.id}`, { signal })
      if (res.status === 404) throw httpError(404)
      return res.json() as Promise<{ name: string; email: string }>
    },
  },
]
```

```html User.kn
<script lang="ts">
  import { Loading } from '@inflector/keeno'
  const { data } = props<{ data: { name: string; email: string } }>()
</script>

<Loading fallback={() => <p>Loading…</p>}>
  <h1>{data.name}</h1>
  <p>{data.email}</p>
</Loading>
```

- `load` starts as soon as the route matches, in parallel with the code of a `lazy()` page, so there is no request waterfall.
- It receives `params`, `query` (a `URLSearchParams`), `path` and a `signal` to pass to `fetch`.
- `data` works like an [async derived](reactivity.md#async-derived): read it inside `<Loading>`, and `pending(() => data)` is true while it loads. When only the params or the query string change, the page is kept and shows the previous data until the new data arrives. A hash change doesn't load it again.
- An error thrown by `load` is thrown where the page reads `data`. Throw `httpError(404)` to show the route's 404 page.
- Server rendering waits for `load`, and hydration uses the data the server sent instead of loading it again.
- `staleTime: 10_000` on the route reuses a result for 10 seconds when navigating back to the same URL. By default, each visit loads again.
- To read a database directly instead of calling an API, use a [server function](server-functions.md): `load: ({ params }) => getUser(params.id)`.

### Queries

`query(key, fn)` is the cache that route data uses. Use it for data that isn't tied to a route, inside an async `derived`:

```ts
import { query } from '@inflector/keeno-router'

const user = derived(({ signal }) => query(['users', userId], () => fetch(`/api/users/${userId}`, { signal }).then((r) => r.json())))
```

- Reads of the same key share a request while it is in flight. `{ staleTime: ms }` also reuses the result for that long. Failures aren't cached.
- Call `query()` before any `await` in the derived. The derived then runs again when the key is invalidated.
- `invalidate()` marks every key stale, `invalidate(['users'])` marks the keys that start with `'users'`, and `invalidate((key) => …)` marks the keys a function accepts. Route data uses keys starting with `'route'`.
- On the server nothing is cached, so concurrent requests never share data.

### Actions

`action(fn)` wraps a mutation. Calling it runs `fn`, and when `fn` succeeds it invalidates the cache, so the route data and queries on screen load again:

```html EditUser.kn
<script lang="ts">
  import { action } from '@inflector/keeno-router'
  const { data, params } = props<{ data: { name: string }; params: { id: string } }>()

  const save = action(async (form: FormData) => {
    const res = await fetch(`/api/users/${params.id}`, { method: 'PUT', body: form })
    if (!res.ok) throw new Error('Could not save')
  })
</script>

<form onSubmit={save.submit}>
  <input name="name" value={data.name} />
  <button disabled={save.pending}>{save.pending ? 'Saving…' : 'Save'}</button>
  {save.error && <p class="error">{(save.error as Error).message}</p>}
</form>
```

- `save(…)` returns a promise of what `fn` returns. `save.pending`, `save.result` and `save.error` are reactive. `save.reset()` clears the result and the error.
- `save.submit` is a form `onSubmit` handler: it prevents the page load and calls the action with the form's `FormData`. Its errors stay in `save.error`.
- `action(fn, { invalidate: [['users']] })` only invalidates those keys, and `{ invalidate: false }` invalidates nothing.

## Prefetching

`<Link prefetch>` loads the code and the `load` data of the page a link points to before the click, so the page shows at once:

```html
<Link href="/users/1" prefetch>Ada</Link>             <!-- on hover or focus -->
<Link href="/pricing" prefetch="viewport">Pricing</Link>  <!-- once visible -->
<Link href="/dashboard" prefetch="eager">Dashboard</Link> <!-- right away -->
```

- `prefetch` (or `prefetch="hover"`) starts when the pointer rests on the link for 50 ms, when it gets keyboard focus, or on touch.
- `<Router prefetch="hover">` sets the default for every `<Link>`. A link can opt out with `prefetch="none"`.
- A prefetched result is used by the next navigation to that URL within 30 seconds, whatever the route's `staleTime`.
- `prefetch('/users/1')` does the same from code, for your own anchors or to warm up the likely next page.
- Nothing is prefetched when the browser asks to save data (`navigator.connection.saveData`).

## View transitions

`<Router viewTransition>` animates navigations with the browser's [View Transitions API](https://developer.mozilla.org/docs/Web/API/View_Transition_API): links, `navigate()`, and back and forward. By default the browser cross-fades the old page into the new one. Browsers without the API navigate as usual.

```html App.kn
<Router routes={routes} viewTransition />
```

- One navigation can opt out with `navigate(to, { transition: false })`, or opt in without the router default with `navigate(to, { transition: true })`, `<Link transition>` or `<a data-transition onClick={link}>`.
- The new page is rendered inside the transition, so code right after `navigate()` still sees the old route until the browser starts the transition.
- Give an element the same `view-transition-name` on both pages to animate it from one position to the other, for example a thumbnail that grows into a hero image:

```html
<!-- List.kn -->
<img src={photo.thumb} style={`view-transition-name: photo-${photo.id}`} />

<!-- Photo.kn -->
<img src={photo.full} style={`view-transition-name: photo-${photo.id}`} />
```

Customize the animation with the `::view-transition-*` pseudo-elements, and respect users who prefer less motion:

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

Put this CSS in a global stylesheet, or inside `:global()` in a component's `<style>`.

## File-based routing

With the Vite plugin, the routes can come from the files in `src/pages` instead: `about.kn` is `/about`, `[id].kn` is `/:id`, with `_layout.kn`, `_404.kn` and `_500.kn` for layouts and error pages. See [File-based routing](file-routing.md).

## Server rendering

On the server there is no browser location, so pass the request URL: `<Router routes={routes} url={request.url} />`. See [Server rendering](ssr.md).

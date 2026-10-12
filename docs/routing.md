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

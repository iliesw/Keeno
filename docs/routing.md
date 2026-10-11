# Routing

`@inflector/lux-router` is a small client-side router built on the History API.

```bash
bun add @inflector/lux-router
```

## Routes

```html App.lx
<script lang="ts">
  import { lazy } from '@inflector/lux'
  import { Link, Router, type RouteDefinition } from '@inflector/lux-router'
  import Home from './Home.lx'
  import User from './User.lx'
  import NotFound from './NotFound.lx'

  const routes: RouteDefinition[] = [
    { path: '/', component: Home },
    { path: '/users/:id', component: User },
    { path: '/settings', component: lazy(() => import('./Settings.lx')) },
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

```html User.lx
<script lang="ts">
  import { useRoute } from '@inflector/lux-router'
  const { params } = props<{ params: { id: string } }>()
  const route = useRoute()
</script>

<h1>User {params.id}</h1>
<p>Tab: {route.query.get('tab') ?? 'overview'}</p>
```

`useRoute()` gives the current route anywhere inside `<Router>`: `path`, `params`, `query` (a `URLSearchParams`), `hash` and `matched` (the route definition). Its fields are reactive, so templates and `update()` follow navigation.

## Navigation

- `<Link href="/users/1">` renders an `<a>` that navigates without reloading. While its path is active, it gets the class `active` (change it with `activeClass`) and `aria-current="page"`. A link is active on its own path and on the paths below it, and `exact` limits it to its own path. `replace` replaces the history entry instead of adding one.
- Component-scoped styles don't reach the `<a>` that `<Link>` renders. To style links with scoped CSS, write your own anchor with the `link` click handler: `<a href="/about" onClick={link}>About</a>`. With a `base`, write `href={href('/about')}`. `isActive('/about')` tells you whether to mark it.
- `navigate('/users/2')` navigates from code. `navigate('/login', { replace: true })` replaces the current entry, and `{ scroll: false }` keeps the scroll position. Relative URLs such as `navigate('?tab=2')` work too.
- Clicks with a modifier key, a middle click, `target="_blank"`, `download` and links to other sites are left to the browser.
- Query parameters synced with `state(v, { url: 'tab' })` follow navigation, including back and forward.

## Server rendering

On the server there is no browser location, so pass the request URL: `<Router routes={routes} url={request.url} />`. See [Server rendering](ssr.md).

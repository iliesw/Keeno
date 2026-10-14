# File-based Routing

With the Vite plugin, the files in `src/pages` are your routes: `about.kn` is `/about`, `users/[id].kn` is `/users/:id`, and `_layout.kn` wraps the pages next to it. There is no route table to keep in sync, and nothing to install beyond `@inflector/vite-plugin-keeno`, which comes with the [router](routing.md).

## Setup

File routing is on by default. These are the defaults, written out:

```ts vite.config.ts
import { defineConfig } from 'vite'
import keeno from '@inflector/vite-plugin-keeno'

export default defineConfig({
  plugins: [keeno({ useFileRouter: true, pages: './src/pages' })],
})
```

Mount the `Pages` component of `virtual:keeno-pages`. It renders the page for the current URL, inside its layouts:

```ts main.ts
import { mount } from '@inflector/keeno'
import Pages from 'virtual:keeno-pages'

mount(Pages, document.getElementById('app')!)
```

For TypeScript, reference the plugin's client types once, in any `.d.ts` file:

```ts env.d.ts
/// <reference types="@inflector/vite-plugin-keeno/client" />
```

| Option | Default | |
|---|---|---|
| `useFileRouter` | `true` | Provide `virtual:keeno-pages`. `false` turns it off. |
| `pages` | `'./src/pages'` | The pages directory, relative to the Vite root. It must be inside the root. |

## Files and routes

```
src/pages/
├── _layout.kn        layout around every page
├── _404.kn           no page matches
├── _500.kn           a page threw an error
├── index.kn          /
├── about.kn          /about
├── users/
│   ├── _layout.kn    layout around the users pages, inside the root one
│   ├── index.kn      /users
│   ├── new.kn        /users/new
│   └── [id].kn       /users/:id
└── docs/
    ├── intro.kn      /docs/intro
    └── _all.kn       anything else below /docs
```

| File | Route |
|---|---|
| `index.kn` | The directory's own path: `index.kn` is `/`, `users/index.kn` is `/users`. |
| `about.kn` | `/about`. Directories add segments: `blog/latest.kn` is `/blog/latest`. |
| `[id].kn` | One segment, as `params.id`. Directories work too: `users/[id]/posts.kn` is `/users/:id/posts`. |
| `_all.kn` | Every path below its directory that no other page matches, as `params['*']`. |
| `_layout.kn` | Wraps the pages of its directory and of the directories below it. |
| `_404.kn` | Paths below its directory that match nothing. |
| `_500.kn`, `_403.kn`, … | Errors with that HTTP status, thrown while a page renders. |

The most specific route wins, whatever the order of the files: static segments before `[param]`s, and `[param]`s before `_all`. So `users/new.kn` matches `/users/new` and `users/[id].kn` matches every other `/users/…`.

Files and directories whose names start with `_` and that aren't one of the special files above are not routes. Keep a page's own components next to it, as `users/_Avatar.kn` or `users/_components/`.

## Pages

A page is an ordinary component. It receives `params`, and `useRoute()` gives it the query string and the rest of the route:

```html users/[id].kn
<script lang="ts">
  import { useRoute } from '@inflector/keeno-router'
  const { params } = props<{ params: { id: string } }>()
  const route = useRoute()
</script>

<h1>User {params.id}</h1>
<p>Tab: {route.query.get('tab') ?? 'overview'}</p>
```

Moving from `/users/1` to `/users/2` keeps the page and updates `params` in place, so write anything that depends on them reactively (in the template, `derived` or `update`).

Pages load on demand: each one is its own chunk, fetched the first time it is shown. Layouts and error pages are bundled with the routes, so they never wait.

Link between pages with `<Link>` and `navigate()`, as described in [Routing](routing.md#navigation).

### Page data

A `.load.ts` file next to a page loads its data. It exports a `load` function, and the page receives what it returns as `data`:

```ts users/[id].load.ts
import { httpError, type LoadContext } from '@inflector/keeno-router'

export async function load({ params, signal }: LoadContext) {
  const res = await fetch(`/api/users/${params.id}`, { signal })
  if (res.status === 404) throw httpError(404)
  return res.json() as Promise<{ name: string }>
}
```

```html users/[id].kn
<script lang="ts">
  import { Loading } from '@inflector/keeno'
  const { data } = props<{ data: { name: string } }>()
</script>

<Loading fallback={() => <p>Loading…</p>}>
  <h1>{data.name}</h1>
</Loading>
```

The loader is its own chunk, fetched in parallel with the page's code. See [Loading data](routing.md#loading-data) for how `data` behaves, and for `action()` and prefetching.

## Layouts

A `_layout.kn` receives `params` and `children`, and renders `{children}` where the page goes:

```html _layout.kn
<script lang="ts">
  import type { Children } from '@inflector/keeno'
  import { Link } from '@inflector/keeno-router'
  const { children } = props<{ children: Children }>()
</script>

<nav>
  <Link href="/" exact>Home</Link>
  <Link href="/users">Users</Link>
</nav>
<main>{children}</main>

<style>
  .active { font-weight: 600 }
</style>
```

- Layouts nest. A page in `users/` renders inside `users/_layout.kn`, which renders inside `_layout.kn`.
- A layout stays mounted while you navigate between pages that share it. Only what changes below it is replaced, so the root layout is your app shell: its state, its DOM, a playing video or a scroll position in a sidebar survive navigation.
- `params` follows the URL, so a layout in `users/[id]/` can show the user while its pages switch between tabs.

## Not found and error pages

A path that matches no page renders the closest `_404.kn`: for `/users/1/nope`, `users/_404.kn` if there is one, else `_404.kn`. It renders inside the layouts of its directory. Without any `_404.kn`, nothing is rendered.

A page can show an error page itself by throwing `httpError(status)`:

```html users/[id].kn
<script lang="ts">
  import { httpError } from '@inflector/keeno-router'
  const { params } = props<{ params: { id: string } }>()
  if (!/^\d+$/.test(params.id)) throw httpError(404, `No user ${params.id}`)
</script>

<h1>User {params.id}</h1>
```

Any other error thrown while the page renders (including in `init` and `update`) is a 500. The page for that status comes from the closest directory that has one, and renders inside the page's layouts. If there is none, the error goes on to the closest [`<ErrorBoundary>`](built-ins.md#errorboundary), or to `mount()`.

Error pages receive `status`, `error`, `params` and `reset`:

```html _500.kn
<script lang="ts">
  const { status, error, reset } = props<{ status: number; error: unknown; reset: () => void }>()
</script>

<h1>Error {status}</h1>
<p>{error instanceof Error ? error.message : String(error)}</p>
<button onClick={reset}>Try again</button>
```

`reset()` renders the page again, and navigating to another path clears the error. As with `<ErrorBoundary>`, errors in event handlers, timers and promises don't happen while rendering, so they don't show an error page: store them in a state and throw it from the template if they should. `errorStatus(error)` gives the status a thrown value maps to.

## Server rendering

The simplest setup is `keeno({ renderStrategy: 'ssr' })` (or `'ssg'` or `'islands'`) with `start()` in `src/main.ts`. See [Render strategies](ssr.md#render-strategies).

To set it up yourself, pass the request URL as `url`. Pages load on demand and rendering is synchronous, so load the page first with `preloadRoute()`, on the server and again in the browser before hydrating:

```ts entry-server.ts
import { renderToString } from '@inflector/keeno/server'
import { preloadRoute } from '@inflector/keeno-router'
import Pages, { routes } from 'virtual:keeno-pages'

export async function render(url: string) {
  await preloadRoute(routes, url)
  return renderToString(Pages, { url })
}
```

```ts entry-client.ts
import { hydrate } from '@inflector/keeno'
import { preloadRoute } from '@inflector/keeno-router'
import Pages, { routes } from 'virtual:keeno-pages'

await preloadRoute(routes, location.pathname)
hydrate(Pages, document.getElementById('app')!)
```

See [Server rendering](ssr.md) for the rest of the setup.

## Without the plugin's module

`virtual:keeno-pages` also exports `routes`, the generated route definitions, to pass to your own `<Router>`:

```html App.kn
<script lang="ts">
  import { Router } from '@inflector/keeno-router'
  import { routes } from 'virtual:keeno-pages'
</script>

<Router routes={routes} base="/app" />
```

`Pages` itself takes the other props of `<Router>`, such as `<Pages base="/app" />`.

The routes come from `pageRoutes()`, which works with any `import.meta.glob` of `.kn` files:

```ts
import { pageRoutes } from '@inflector/keeno-router'

const routes = pageRoutes(import.meta.glob('/src/pages/**/*.kn'), '/src/pages')
```

Hand-written routes can use the same features: a `RouteDefinition` takes `layouts` (outermost first) and `errors` (error pages by status).

```ts
const routes: RouteDefinition[] = [
  { path: '/', component: Home, layouts: [Shell], errors: { 404: NotFound, 500: Oops } },
]
```

# Server rendering

Keeno renders components to HTML on the server (Node, Bun or Deno) with `renderToString`. In the browser, `hydrate` then takes over that markup.

```bash
bun add linkedom
```

To have the Vite plugin set it all up, see [Render strategies](#render-strategies). The rest of this page is the manual setup.

`renderToString` creates nodes with [linkedom](https://github.com/WebReflection/linkedom), a small server-side DOM, so it needs that package installed. It doesn't change any globals.

## Render strategies

With the [file router](file-routing.md), the Vite plugin can do the whole setup. Pick how pages render with one option:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import keeno from '@inflector/vite-plugin-keeno'

export default defineConfig({ plugins: [keeno({ renderStrategy: 'ssr' })] })
```

```ts
// src/main.ts
import { start } from 'virtual:keeno-pages'

start()
```

| `renderStrategy` | `vite dev` | `vite build` | In the browser |
|---|---|---|---|
| `'spa'` (default) | index.html | `dist/` | `start()` mounts the pages |
| `'ssr'` | each request rendered and streamed | `dist/client` and `dist/server` | `start()` hydrates the page |
| `'ssg'` | each request rendered | `dist/<path>/index.html` for every page | `start()` hydrates the page |
| `'islands'` | each request rendered | `dist/<path>/index.html` for every page | only islands hydrate |

- **Template:** `index.html` needs an app container, `<div id="app"></div>`. The page goes inside it, and the [`<Head>`](built-ins.md#head) tags go in `<head>` (they replace its `<title>`). The response status comes from the router: `404` for a missing page, or an error page's status.
- **Styles:** component styles are linked in the page's `<head>`, so the page is styled before any JavaScript runs.
- **Needs:** `linkedom` (`bun add linkedom`), and the file router (`useFileRouter`, on by default).

### ssr in production

`vite build` writes the browser files to `dist/client` and the server bundle to `dist/server`. `vite preview` serves them. For your own server, use `createHandler`:

```js
// server.js
import { createServer } from 'node:http'
import { createHandler } from '@inflector/vite-plugin-keeno/server'

createServer(createHandler()).listen(3000)
// or with Bun: Bun.serve({ port: 3000, fetch: createHandler().fetch })
```

It serves the files in `dist/client` (with long-lived caching for `assets/`) and renders every other GET request as a stream. It works as Connect or Express middleware too: `app.use(createHandler())`.

### ssg

`vite build` renders every page without parameters to HTML, plus a `404.html` when there is a [not-found page](file-routing.md#not-found-and-error-pages). List paths for routes with parameters in `prerender`:

```ts
keeno({ renderStrategy: 'ssg', prerender: ['/blog/hello', '/blog/world'] })
// or a function: prerender: async () => (await getPosts()).map((p) => `/blog/${p.slug}`)
```

Any static host can serve `dist/`.

### islands

Pages are static HTML, built like `ssg`. Only components written with `client="…"` load their JavaScript, and each one hydrates on its own:

```html index.kn
<script lang="ts">
  import Counter from '../components/Counter.kn'
</script>

<h1>Static heading</h1>
<Counter client="visible" start={5} />
```

- **`client="load"`:** hydrate as soon as the page loads.
- **`client="idle"`:** when the browser is idle.
- **`client="visible"`:** when the component scrolls into view.
- **Props** must be JSON data: functions and children can't be sent to the browser.
- **Imports:** the component must be imported from a `.kn` file, which is what the browser loads.
- **Context:** an island is its own app in the browser, so `inject()` doesn't see values provided by the page around it.
- A page without islands ships no JavaScript at all.
- With other strategies, `client` is ignored and the component renders as usual.

## Rendering

```ts
// src/entry-server.ts
import { renderToString } from '@inflector/keeno/server'
import App from './App.kn'

export async function render(url: string) {
  return renderToString(App, { url })
}
```

```ts
// src/entry-client.ts
import { hydrate } from '@inflector/keeno'
import App from './App.kn'

hydrate(App, document.getElementById('app')!)
```

What runs on the server:

- The `<script>` block, templates, `derived` values and child components render, and text and attributes are escaped.
- `init` and `update` callbacks **don't** run, because there is no mounted DOM. Put browser-only code (`window`, `localStorage`, timers, fetching in the browser) in `init`.
- [Async deriveds](reactivity.md#async-derived) are awaited: the HTML contains their values, not the `<Loading>` fallback. See [Data](#data) below.
- `<Await>` and `lazy()` render their pending content.
- `state(v, { persist })` and `state(v, { url })` use their initial value.
- `<Transition>` doesn't animate.
- Input values are written as `value="…"` attributes, so they show before the page hydrates.

## Data

`renderToString` waits for the async deriveds the page reads, then returns the HTML with their values, plus a `<script type="application/json" data-keeno-data>` holding them:

```html Post.kn
<script lang="ts">
  import { Loading } from '@inflector/keeno'
  const { id } = props<{ id: string }>()
  const post = derived(async ({ signal }) => (await fetch(`https://api.example.com/posts/${id}`, { signal })).json())
</script>

<Loading fallback={() => <p>Loading…</p>}>
  <h1>{post.title}</h1>
</Loading>
```

- `hydrate` reads that script, and each async derived starts with the value the server fetched, so the page doesn't flash a fallback or wait for the data again. The function still runs once to know what it depends on, with an already-aborted `signal`, so a `fetch` given `signal` never reaches the network. Without `signal`, the request is made and its result ignored.
- Values must be JSON-serializable. `derived(fn, { ssr: false })` keeps a value out of the HTML (the browser fetches it).
- Values are matched by the order async deriveds first run, which is the same on the server and in the browser for the same props and URL. `derived(fn, { key: 'post' })` names one explicitly.
- `renderToString(App, props, { timeout })` stops waiting after `timeout` ms (default 10 000). What's still loading renders its fallback and is fetched in the browser.

## Streaming

`renderToStream(App, props)` returns a `ReadableStream<string>`. The first chunk is the page with each waiting `<Loading>` showing its fallback, so the browser can paint right away. Each boundary's content follows as soon as its data is ready, and a small inline script swaps it in place of the fallback.

```ts
// Bun or any runtime with web streams
import { renderToStream } from '@inflector/keeno/server'
import App from './App.kn'

Bun.serve({
  async fetch(req) {
    const app = renderToStream(App, { url: req.url })
    const head = '<!doctype html><html><head><script type="module" src="/entry-client.js"></script></head><body><div id="app">'
    const tail = '</div></body></html>'
    const body = app.pipeThrough(
      new TransformStream<string, string>({
        start: (c) => c.enqueue(head),
        flush: (c) => c.enqueue(tail),
      }),
    ).pipeThrough(new TextEncoderStream())
    return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  },
})
```

- Load the client entry with `<script type="module">`: module scripts run after the document has finished loading, so `hydrate` sees the complete page.
- Nested boundaries stream independently. One that is ready before the boundary around it goes out with it.
- Portals render with the first chunk; a portal inside a streamed boundary appears when the page hydrates.

## Hydration

`hydrate(App, element, props)` renders the app in the browser and replaces the server markup in the same task, so nothing flashes. It is simpler than node-by-node hydration, but has some costs:

- The client renders the whole tree once, so the page becomes interactive no faster than with `mount()`.
- Focus, text selection and text typed into inputs before `hydrate` runs are lost. Keep the time between first paint and hydration short: load the client script with `<script type="module">` in `<head>`.
- If the client render throws, the server markup stays and the error is rethrown.

## Head and status

Pass a `context` object to collect the [`<Head>`](built-ins.md#head) tags and the response status:

```ts
export async function render(url: string) {
  const context: RenderContext = {}
  const html = await renderToString(App, { url }, { context })
  return { html, head: context.head, status: context.status ?? 200 }
}
```

- `context.head` is the HTML of the `<Head>` tags. Put it inside your template's `<head>`.
- `context.status` is set when the router renders an error page (the page's status, for example `404` from `throw new HttpError(404)`) or when no route matches (`404`).
- With `renderToStream`, both are filled in when the first chunk arrives. Read them before sending the response headers.

## With Vite

Set up Vite's SSR mode as the [Vite SSR guide](https://vite.dev/guide/ssr) describes. `@inflector/vite-plugin-keeno` needs no extra options.

- **In development**, load your server entry with `vite.ssrLoadModule('/src/entry-server.ts')`. Don't import `renderToString` directly in your Node server file. The components and `renderToString` must come from the same copy of the runtime, and the runtime warns when two copies are loaded.
- **In production**, build the client with `vite build`, then the server entry with `vite build --ssr src/entry-server.ts`, and import the server bundle from Node.
- Scoped CSS is part of the client build. Link the CSS files from Vite's manifest in your HTML template, as the Vite guide describes.

## Routing

On the server, give the router the request URL: `<Router routes={routes} url={url} />`, with `url` a prop of your app that only `entry-server` passes. On the client `url` is `undefined`, so the router follows the browser location. See [Routing](routing.md).

## Without Vite

`renderToStringWith(document, App, props)` renders synchronously with a DOM document you provide, for example another server DOM implementation, or a test.

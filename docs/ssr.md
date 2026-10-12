# Server rendering

Keeno renders components to HTML on the server (Node, Bun or Deno) with `renderToString`. In the browser, `hydrate` then takes over that markup.

```bash
bun add linkedom
```

`renderToString` creates nodes with [linkedom](https://github.com/WebReflection/linkedom), a small server-side DOM, so it needs that package installed. It doesn't change any globals.

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

## With Vite

Set up Vite's SSR mode as the [Vite SSR guide](https://vite.dev/guide/ssr) describes. `@inflector/vite-plugin-keeno` needs no extra options.

- **In development**, load your server entry with `vite.ssrLoadModule('/src/entry-server.ts')`. Don't import `renderToString` directly in your Node server file. The components and `renderToString` must come from the same copy of the runtime, and the runtime warns when two copies are loaded.
- **In production**, build the client with `vite build`, then the server entry with `vite build --ssr src/entry-server.ts`, and import the server bundle from Node.
- Scoped CSS is part of the client build. Link the CSS files from Vite's manifest in your HTML template, as the Vite guide describes.

## Routing

On the server, give the router the request URL: `<Router routes={routes} url={url} />`, with `url` a prop of your app that only `entry-server` passes. On the client `url` is `undefined`, so the router follows the browser location. See [Routing](routing.md).

## Without Vite

`renderToStringWith(document, App, props)` renders synchronously with a DOM document you provide, for example another server DOM implementation, or a test.

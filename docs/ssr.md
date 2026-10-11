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
- `<Await>` renders its `pending` content, because rendering is synchronous. Fetch data before you render and pass it as props when the page needs it in the HTML.
- `state(v, { persist })` and `state(v, { url })` use their initial value.
- `<Transition>` doesn't animate.
- Input values are written as `value="…"` attributes, so they show before the page hydrates.

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

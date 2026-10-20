# @inflector/keeno

## 0.9.0

### Minor Changes

- [#35](https://github.com/iliesw/Keeno/pull/35) [`eecd941`](https://github.com/iliesw/Keeno/commit/eecd941e28bfb44fe4a948590c195a02f2dd0b46) Thanks [@iliesw](https://github.com/iliesw)! - Dev tools for coding agents. During `vite dev`, the plugin serves an MCP server at `/__keeno/mcp` that lets agents such as Claude Code look into the running app: the component tree, props and states, the state timeline, dependencies, performance, routes, the page's console errors, compile and server errors, plus writing states, navigating, time travel and running code in the page. Calls are answered by an open browser tab over Vite's HMR socket, and only local requests are accepted. Add it with `claude mcp add --transport http keeno http://localhost:5173/__keeno/mcp`; new `create-keeno` projects get a `.mcp.json`. Turn it off with `keeno({ mcp: false })`.
  
  The dev tools panel has a new **Agent** tab: **Add to Claude Code** sets the server up in one click (with the `claude` CLI, or in `.mcp.json`), it shows whether an agent is connected, and it lists every tool call live with its arguments, duration and result. Components an agent inspects flash on the page, and state writes made by an agent are marked `agent` in the Timeline.

## 0.8.0

### Minor Changes

- [#30](https://github.com/iliesw/Keeno/pull/30) [`bf81575`](https://github.com/iliesw/Keeno/commit/bf81575f7552a63f66e9680be9a374606d06ed48) Thanks [@iliesw](https://github.com/iliesw)! - Server functions. Wrap an async function in `server(…)` and it runs on the server: call it like any function, and in the browser the call becomes a typed request (`POST /_keeno/fn/<id>`). It is auto-imported in `.kn` files and imported from `@inflector/keeno` in `.ts` files. The compiler leaves the function, and the imports only it used, out of the browser bundle, and reports a server function that uses a component's variables. Arguments and results keep `Date`, `Map`, `Set`, `BigInt` and `undefined`, a `FormData` is sent as a form, and errors arrive as `ServerFunctionError` with their status. `getRequest()` and `setHeader()` from `@inflector/keeno/server` give access to the request and response. Apps with server functions build `dist/client` and `dist/server` with every render strategy, and `createHandler()` serves them, including `spa`, `ssg` and `islands` builds.

## 0.7.1

### Patch Changes

- [#28](https://github.com/iliesw/Keeno/pull/28) [`b82855f`](https://github.com/iliesw/Keeno/commit/b82855fecedb073a05fe5e4ff40ac9e2f4ef6e0d) Thanks [@iliesw](https://github.com/iliesw)! - `<Virtual>`: a list that gets shorter while scrolled far down now shows its last rows instead of a blank box (the scroll position is clamped like the browser does), and `scrollTo(index, 'smooth')` follows the smooth scroll instead of jumping the rows ahead of it.

## 0.7.0

### Minor Changes

- [#26](https://github.com/iliesw/Keeno/pull/26) [`cfdaf42`](https://github.com/iliesw/Keeno/commit/cfdaf42a15a36b4ce4c4b2d18cea6f5810659738) Thanks [@iliesw](https://github.com/iliesw)! - Dev tools: time travel through the recorded state writes (a slider in the Timeline, and `travel(seq)` in the console API), dependency chips under each state in the Inspector, and a Graph tab with the selected component's dependency graph (`deps(id)` and `graph(componentId)` in the API).

- [#23](https://github.com/iliesw/Keeno/pull/23) [`4989bf8`](https://github.com/iliesw/Keeno/commit/4989bf86e9f021be3eb9ac22af838b35b4de2564) Thanks [@iliesw](https://github.com/iliesw)! - Add `<Head>`, a built-in that puts `<title>`, `<meta>` and `<link>` tags in the document head from any component: the deepest one wins, tags come back on unmount, and server renders collect them into `context.head`. Server renders also report the router's error-page status in `context.status`. The compiler now handles `{expressions}` inside `<title>` and `<textarea>`, whose content the HTML parser reads as text.

- [#25](https://github.com/iliesw/Keeno/pull/25) [`d29c991`](https://github.com/iliesw/Keeno/commit/d29c9910cbb496b3130dc8ace71ff5959ec62e4c) Thanks [@iliesw](https://github.com/iliesw)! - Add `renderStrategy` to the Vite plugin: `'spa'` (default), `'ssr'` (rendered and streamed per request in dev, `dist/client` + `dist/server` builds served by `createHandler()` from `@inflector/vite-plugin-keeno/server` or `vite preview`), `'ssg'` (every page rendered to HTML at build time, plus `prerender` paths) and `'islands'` (static HTML where only components written with `client="load" | "idle" | "visible"` load JavaScript, each hydrated on its own). Start apps with `start()` from `virtual:keeno-pages`. `create-keeno --render <strategy>` scaffolds each one.

- [#21](https://github.com/iliesw/Keeno/pull/21) [`1204bf3`](https://github.com/iliesw/Keeno/commit/1204bf39252f85c939f033440fc989ad8aaee56e) Thanks [@iliesw](https://github.com/iliesw)! - Add a Router tab to the dev tools: the current path, params, query and matched route, the route table (with layouts and error pages), and the navigation history. Click a route or a history entry to navigate, or type a path in the "go to" field.

- [#22](https://github.com/iliesw/Keeno/pull/22) [`d73ab43`](https://github.com/iliesw/Keeno/commit/d73ab432baff30434f7a992f4fe2b16939dc303e) Thanks [@iliesw](https://github.com/iliesw)! - Add the `save` state option for optimistic updates: writes apply at once, are sent with `save(next, prev, { signal })`, roll back if it rejects, and report through `pending()`.

- [#24](https://github.com/iliesw/Keeno/pull/24) [`b5808ea`](https://github.com/iliesw/Keeno/commit/b5808ead7ebb59e64e9c85f5ca869c6131924731) Thanks [@iliesw](https://github.com/iliesw)! - Add `<Virtual>`, a built-in list that only renders the rows in view: `<Virtual each={rows} itemHeight={24}>{(row, i) => <Row row={row} />}</Virtual>`. Fixed or per-item heights, keyed rows that survive scrolling, store arrays, `scrollTo(index)` through `ref`, and server rendering of the first screen. In `.kn` files, a component whose children are a render function now types that function's parameters.

## 0.6.2

No changes in this release.

## 0.6.1

### Patch Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) [`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a) Thanks [@iliesw](https://github.com/iliesw)! - PR

## 0.6.0

### Minor Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) `use:` directives: reusable DOM behaviors written as plain functions (`Directive<Element, Value>`, `(el, value) => cleanup`) and used as `use:name={value}` on any element. They run after insertion, run again (after their cleanup) when the value changes, clean up on removal, don't run during server rendering, and send errors to `<ErrorBoundary>`. The dev tools now show a loading async derived with a `pending` badge instead of an error, without starting a run.

## 0.5.0

### Minor Changes

- [#14](https://github.com/iliesw/Keeno/pull/14) [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248) Thanks [@iliesw](https://github.com/iliesw)! - Async `derived`: give `derived` an async function and read the value inside the new `<Loading fallback>` boundary. Re-runs keep the current value until the new one arrives (`pending(() => x)` tells you one is in flight), superseded runs are ignored and aborted through the optional `{ signal }` argument, `x.refresh()` runs it again, and rejections go to the closest `<ErrorBoundary>`.

- [#14](https://github.com/iliesw/Keeno/pull/14) [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248) Thanks [@iliesw](https://github.com/iliesw)! - Server rendering waits for async deriveds: `renderToString` returns their values in the HTML (with a `timeout` option) and sends them to the client, where `hydrate` reuses them instead of fetching again. New `renderToStream` sends the page right away with `<Loading>` fallbacks and streams each boundary's content as it becomes ready. Concurrent server renders no longer share the portal outlet, and `init`/`update` mount jobs are never queued on the server.

- [#14](https://github.com/iliesw/Keeno/pull/14) [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248) Thanks [@iliesw](https://github.com/iliesw)! - `store()`: a deep reactive object you update by plain mutation (`todos.items.push(…)`, `todo.done = true`), tracked per property. Includes `snapshot()`, `reconcile()` and `isStore()`, works with keyed lists, and `bind:value` / `bind:checked` accept store properties (`bind:value={form.user.email}`). `store` is available in `.kn` files without importing.

## 0.4.1

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

### Minor Changes

- [`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c) Thanks [@iliesw](https://github.com/iliesw)! - In-page dev tools panel (`@inflector/keeno/devtools`), built with Keeno itself and loaded automatically during `vite dev` (Alt+Shift+D, or the ◆ Keeno button):
  
  - Components: a searchable live tree with an inspector for props and named states. Strings, numbers and booleans are edited inline, any state can be edited as JSON, and states with `history` get undo/redo. A link opens the file in your editor, and the selected component is exposed as `$keeno`.
  - Picker (Alt+Shift+C): hover to see which component renders an element, click to select it.
  - Highlight updates: components flash on the page when they re-render, and tree rows show update counts.
  - Timeline: every state write with a structural diff (`todos [1].done false → true`), its source (url/remote/history), errors, filter/pause, and revert to the previous value.
  - Perf: flush timings with a chart, and the components that update most.
  
  The compiler's new `dev` option names states and deriveds after their variables and records each component's source file. The Vite plugin turns it on during `vite dev`; `keeno({ devtools: false })` turns the panel off. `__KEENO_DEVTOOLS__` gains `components()`, `details()`, `set()`, `log()`, `stats()` and `subscribe()`.

### Patch Changes

- [`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c) Thanks [@iliesw](https://github.com/iliesw)! - Fix correctness and security bugs:
  
  - keeno: a computation no longer runs after the condition it renders under turned false (re-running its parent first); a derived that failed on its first run notifies readers when it recovers; a throwing `onUpdate` listener no longer leaves computations stale; server rendering supports `<select>` values and `bind:checked`; dynamic inline handler attributes (`onclick` strings) are never set, and spread binds lowercase `onclick` functions as listeners; `onDoubleClick` listens to `dblclick`.
  - compiler: `</script>` inside strings, template literals and comments no longer ends the script; `<style>` inside an inline `<svg>` and data `<script>`s (JSON-LD) stay in the markup; object defaults in `props()` (`items = []`) are evaluated once.
  - router: `href('//x')` no longer gives a protocol-relative URL; `link` leaves links outside the base to the browser; URLs outside the base match no route; server-rendered `<Link>`s use their router's base; `navigate()` fires `keeno:navigate` instead of a fake `popstate`, and scrolls to `#hash` targets.
  - keeno: `<Transition>` cancels running animations when it is destroyed; `mount()` disposes the app when the first render throws; a failed `lazy()` load only affects the instances that were waiting for it; `undo()`/`redo()` keep the history when `validate` refuses the value; `<Portal>` content is included in `renderToString` output, after the app.
  - keeno performance: O(1) scheduler queues and owner removal (clearing long lists is ~30% faster), no per-row index state for `item => …` list callbacks, linear `<Transition>` merging.
  - router: restores the scroll position on back/forward.
  - keeno-check: fails when the tsconfig includes no files (e.g. a solution tsconfig).

## 0.2.0

### Minor Changes

- [`401868e`](https://github.com/iliesw/Lux/commit/401868edbebe68c35af9790f4f63c9bbefdb7ae7) Thanks [@iliesw](https://github.com/iliesw)! - Native reparenting. `reparentable(() => <Video />)` renders content once and lets you show it in different places (`{player}`) while it keeps its component state, and `keyedReparentable()` does the same per key for items that move between lists. Moves use the DOM's native `moveBefore` where available, so iframes, playing media, focus and CSS animations survive them, including moves into a branch that was just created. Keyed list reorders also use `moveBefore` for nodes already in the document. Imperatively, `player.moveTo(element | selector, before?)` and `player.remove()` move or hide the content from code (drag and drop, picture-in-picture), and `moveNode(node, parent, before?)` moves any DOM node natively when possible.

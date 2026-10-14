# @inflector/keeno-compiler

## 0.8.0

### Minor Changes

- [#30](https://github.com/iliesw/Keeno/pull/30) [`bf81575`](https://github.com/iliesw/Keeno/commit/bf81575f7552a63f66e9680be9a374606d06ed48) Thanks [@iliesw](https://github.com/iliesw)! - Server functions. Wrap an async function in `server(…)` and it runs on the server: call it like any function, and in the browser the call becomes a typed request (`POST /_keeno/fn/<id>`). It is auto-imported in `.kn` files and imported from `@inflector/keeno` in `.ts` files. The compiler leaves the function, and the imports only it used, out of the browser bundle, and reports a server function that uses a component's variables. Arguments and results keep `Date`, `Map`, `Set`, `BigInt` and `undefined`, a `FormData` is sent as a form, and errors arrive as `ServerFunctionError` with their status. `getRequest()` and `setHeader()` from `@inflector/keeno/server` give access to the request and response. Apps with server functions build `dist/client` and `dist/server` with every render strategy, and `createHandler()` serves them, including `spa`, `ssg` and `islands` builds.

## 0.7.1

No changes in this release.

## 0.7.0

### Minor Changes

- [#25](https://github.com/iliesw/Keeno/pull/25) [`d29c991`](https://github.com/iliesw/Keeno/commit/d29c9910cbb496b3130dc8ace71ff5959ec62e4c) Thanks [@iliesw](https://github.com/iliesw)! - Add `renderStrategy` to the Vite plugin: `'spa'` (default), `'ssr'` (rendered and streamed per request in dev, `dist/client` + `dist/server` builds served by `createHandler()` from `@inflector/vite-plugin-keeno/server` or `vite preview`), `'ssg'` (every page rendered to HTML at build time, plus `prerender` paths) and `'islands'` (static HTML where only components written with `client="load" | "idle" | "visible"` load JavaScript, each hydrated on its own). Start apps with `start()` from `virtual:keeno-pages`. `create-keeno --render <strategy>` scaffolds each one.

### Patch Changes

- [#23](https://github.com/iliesw/Keeno/pull/23) [`4989bf8`](https://github.com/iliesw/Keeno/commit/4989bf86e9f021be3eb9ac22af838b35b4de2564) Thanks [@iliesw](https://github.com/iliesw)! - Add `<Head>`, a built-in that puts `<title>`, `<meta>` and `<link>` tags in the document head from any component: the deepest one wins, tags come back on unmount, and server renders collect them into `context.head`. Server renders also report the router's error-page status in `context.status`. The compiler now handles `{expressions}` inside `<title>` and `<textarea>`, whose content the HTML parser reads as text.

## 0.6.2

### Patch Changes

- [`20ef0ff`](https://github.com/iliesw/Keeno/commit/20ef0fffaa0c7ce90ef65c6cec98aae1fe48b7ba) Thanks [@iliesw](https://github.com/iliesw)! - Fix keyed `.map()` with a destructured row parameter used in a nested key (`({ p }) => <li key={p.ref}>`): the key function no longer references an undefined `_item`.

## 0.6.1

### Patch Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) [`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a) Thanks [@iliesw](https://github.com/iliesw)! - PR

## 0.6.0

### Minor Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) Compiles `use:name={value}` (and valueless `use:name`) to tracked directive calls. The directive name resolves like any identifier (imports, locals, props, states), and `use:` on a component, a non-identifier name or a string value is a compile error.

## 0.5.0

### Minor Changes

- [#14](https://github.com/iliesw/Keeno/pull/14) [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248) Thanks [@iliesw](https://github.com/iliesw)! - Async `derived`: give `derived` an async function and read the value inside the new `<Loading fallback>` boundary. Re-runs keep the current value until the new one arrives (`pending(() => x)` tells you one is in flight), superseded runs are ignored and aborted through the optional `{ signal }` argument, `x.refresh()` runs it again, and rejections go to the closest `<ErrorBoundary>`.

- [#14](https://github.com/iliesw/Keeno/pull/14) [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248) Thanks [@iliesw](https://github.com/iliesw)! - `store()`: a deep reactive object you update by plain mutation (`todos.items.push(…)`, `todo.done = true`), tracked per property. Includes `snapshot()`, `reconcile()` and `isStore()`, works with keyed lists, and `bind:value` / `bind:checked` accept store properties (`bind:value={form.user.email}`). `store` is available in `.kn` files without importing.

## 0.4.1

### Patch Changes

- [#12](https://github.com/iliesw/Keeno/pull/12) [`7f639a1`](https://github.com/iliesw/Keeno/commit/7f639a161b6484b8a9d1afa16474416ac548a9cc) Thanks [@iliesw](https://github.com/iliesw)! - `keeno-check` now runs the compiler on every .kn file and reports the errors `vite build` would stop on (such as an unsupported `.map()` row parameter) as `file:line:col - error keeno: …`, so a project that passes the check also builds. Compiler errors raised on a node now carry its `.kn` location (`err.loc`), which also points Vite's error overlay at the right spot.

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

- [`401868e`](https://github.com/iliesw/Lux/commit/401868edbebe68c35af9790f4f63c9bbefdb7ae7) Thanks [@iliesw](https://github.com/iliesw)! - First-class Tailwind CSS v4 support. Component `<style>` blocks now go through `@tailwindcss/vite` (`@apply`, `@variant`, `--spacing()`, ...), and the plugin adds the `@reference` to your main stylesheet for you (`lux({ tailwind })` to configure). Rules inside `@utility`, `@theme` and `@custom-variant` are not scoped. The editor knows Tailwind's directives (in `<style>` blocks and plain `.css` files), and the VS Code extension turns on Tailwind CSS IntelliSense for `.lx` files. The virtual style module is now `Foo.lx?lux&type=style&lang.css`.

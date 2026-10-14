# @inflector/keeno-router

## 0.5.0

### Minor Changes

- [#23](https://github.com/iliesw/Keeno/pull/23) [`4989bf8`](https://github.com/iliesw/Keeno/commit/4989bf86e9f021be3eb9ac22af838b35b4de2564) Thanks [@iliesw](https://github.com/iliesw)! - Add `<Head>`, a built-in that puts `<title>`, `<meta>` and `<link>` tags in the document head from any component: the deepest one wins, tags come back on unmount, and server renders collect them into `context.head`. Server renders also report the router's error-page status in `context.status`. The compiler now handles `{expressions}` inside `<title>` and `<textarea>`, whose content the HTML parser reads as text.

- [#21](https://github.com/iliesw/Keeno/pull/21) [`1204bf3`](https://github.com/iliesw/Keeno/commit/1204bf39252f85c939f033440fc989ad8aaee56e) Thanks [@iliesw](https://github.com/iliesw)! - Add a Router tab to the dev tools: the current path, params, query and matched route, the route table (with layouts and error pages), and the navigation history. Click a route or a history entry to navigate, or type a path in the "go to" field.

### Patch Changes

- Updated dependencies [[`cfdaf42`](https://github.com/iliesw/Keeno/commit/cfdaf42a15a36b4ce4c4b2d18cea6f5810659738), [`4989bf8`](https://github.com/iliesw/Keeno/commit/4989bf86e9f021be3eb9ac22af838b35b4de2564), [`d29c991`](https://github.com/iliesw/Keeno/commit/d29c9910cbb496b3130dc8ace71ff5959ec62e4c), [`1204bf3`](https://github.com/iliesw/Keeno/commit/1204bf39252f85c939f033440fc989ad8aaee56e), [`d73ab43`](https://github.com/iliesw/Keeno/commit/d73ab432baff30434f7a992f4fe2b16939dc303e), [`b5808ea`](https://github.com/iliesw/Keeno/commit/b5808ead7ebb59e64e9c85f5ca869c6131924731)]:
  - @inflector/keeno@0.7.0

## 0.4.1

### Patch Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) [`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a) Thanks [@iliesw](https://github.com/iliesw)! - PR
- Updated dependencies [[`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a)]:
  - @inflector/keeno@0.6.1

## 0.4.0

### Minor Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) Requires `@inflector/keeno` 0.6 (peer dependency `>=0.6.0 <1.0.0`).

### Patch Changes

- Updated dependencies []:
  - @inflector/keeno@0.6.0

## 0.3.0

### Minor Changes

- [#14](https://github.com/iliesw/Keeno/pull/14) [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248) Thanks [@iliesw](https://github.com/iliesw)! - View Transitions: `<Router viewTransition>` animates navigations (links, `navigate()`, back and forward) with `document.startViewTransition` where supported. Per navigation: `navigate(to, { transition })`, `<Link transition>` or `data-transition` on links using `link`.

### Patch Changes

- Updated dependencies [[`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248), [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248), [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248)]:
  - @inflector/keeno@0.5.0

## 0.2.0

### Minor Changes

- [`6e319e5`](https://github.com/iliesw/Keeno/commit/6e319e58a6d0acfd52eb96d07aa0af7e4439b0b3) Thanks [@iliesw](https://github.com/iliesw)! - File-based routing. `keeno({ useFileRouter: true, pages: './src/pages' })` (the defaults) provides `virtual:keeno-pages`, whose `<Pages>` component renders the page for the URL: `index.kn` is `/`, `about.kn` is `/about`, `[id].kn` is `/:id`, `_layout.kn` wraps its directory, `_all.kn` catches the rest of its directory, `_404.kn` renders for paths that match nothing, and `_500.kn`, `_403.kn`… for errors a page throws (`throw httpError(403)`).
  
  `<Router>` routes gain `layouts` (kept across navigation while shared) and `errors` (error pages by status), and the router exports `pageRoutes()`, `preloadRoute()`, `httpError()`, `HttpError` and `errorStatus()`.
  
  The Vite plugin now depends on `@inflector/keeno-router` and resolves `@inflector/keeno-router` imports itself when the app hasn't installed it, so routing needs no extra install. `examples/todo` uses file routes (`src/pages`).

### Patch Changes

- Updated dependencies []:
  - @inflector/keeno@0.4.0

## 0.1.1

### Patch Changes

- [`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c) Thanks [@iliesw](https://github.com/iliesw)! - Fix correctness and security bugs:
  
  - keeno: a computation no longer runs after the condition it renders under turned false (re-running its parent first); a derived that failed on its first run notifies readers when it recovers; a throwing `onUpdate` listener no longer leaves computations stale; server rendering supports `<select>` values and `bind:checked`; dynamic inline handler attributes (`onclick` strings) are never set, and spread binds lowercase `onclick` functions as listeners; `onDoubleClick` listens to `dblclick`.
  - compiler: `</script>` inside strings, template literals and comments no longer ends the script; `<style>` inside an inline `<svg>` and data `<script>`s (JSON-LD) stay in the markup; object defaults in `props()` (`items = []`) are evaluated once.
  - router: `href('//x')` no longer gives a protocol-relative URL; `link` leaves links outside the base to the browser; URLs outside the base match no route; server-rendered `<Link>`s use their router's base; `navigate()` fires `keeno:navigate` instead of a fake `popstate`, and scrolls to `#hash` targets.
  - keeno: `<Transition>` cancels running animations when it is destroyed; `mount()` disposes the app when the first render throws; a failed `lazy()` load only affects the instances that were waiting for it; `undo()`/`redo()` keep the history when `validate` refuses the value; `<Portal>` content is included in `renderToString` output, after the app.
  - keeno performance: O(1) scheduler queues and owner removal (clearing long lists is ~30% faster), no per-row index state for `item => …` list callbacks, linear `<Transition>` merging.
  - router: restores the scroll position on back/forward.
  - keeno-check: fails when the tsconfig includes no files (e.g. a solution tsconfig).
- Updated dependencies [[`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c), [`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c)]:
  - @inflector/keeno@0.3.0

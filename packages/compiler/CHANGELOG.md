# @inflector/keeno-compiler

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

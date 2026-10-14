# @inflector/vite-plugin-keeno

## 0.6.1

### Patch Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) [`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a) Thanks [@iliesw](https://github.com/iliesw)! - First published release with the 0.6.0 changes below (the 0.6.0 version itself was never published to npm).
- Updated dependencies [[`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a)]:
  - @inflector/keeno-compiler@0.6.1
  - @inflector/keeno-router@0.4.1

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @inflector/keeno-compiler@0.6.0
  - @inflector/keeno-router@0.4.0

## 0.5.0

### Patch Changes

- Updated dependencies [[`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248), [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248), [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248)]:
  - @inflector/keeno-compiler@0.5.0
  - @inflector/keeno-router@0.3.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`7f639a1`](https://github.com/iliesw/Keeno/commit/7f639a161b6484b8a9d1afa16474416ac548a9cc)]:
  - @inflector/keeno-compiler@0.4.1
  - @inflector/keeno-router@0.2.0

## 0.4.0

### Minor Changes

- [`6e319e5`](https://github.com/iliesw/Keeno/commit/6e319e58a6d0acfd52eb96d07aa0af7e4439b0b3) Thanks [@iliesw](https://github.com/iliesw)! - File-based routing. `keeno({ useFileRouter: true, pages: './src/pages' })` (the defaults) provides `virtual:keeno-pages`, whose `<Pages>` component renders the page for the URL: `index.kn` is `/`, `about.kn` is `/about`, `[id].kn` is `/:id`, `_layout.kn` wraps its directory, `_all.kn` catches the rest of its directory, `_404.kn` renders for paths that match nothing, and `_500.kn`, `_403.kn`… for errors a page throws (`throw httpError(403)`).
  
  `<Router>` routes gain `layouts` (kept across navigation while shared) and `errors` (error pages by status), and the router exports `pageRoutes()`, `preloadRoute()`, `httpError()`, `HttpError` and `errorStatus()`.
  
  The Vite plugin now depends on `@inflector/keeno-router` and resolves `@inflector/keeno-router` imports itself when the app hasn't installed it, so routing needs no extra install. `examples/todo` uses file routes (`src/pages`).

### Patch Changes

- Updated dependencies [[`6e319e5`](https://github.com/iliesw/Keeno/commit/6e319e58a6d0acfd52eb96d07aa0af7e4439b0b3)]:
  - @inflector/keeno-router@0.2.0
  - @inflector/keeno-compiler@0.4.0

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

- Updated dependencies [[`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c), [`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c)]:
  - @inflector/keeno-compiler@0.3.0

## 0.2.0

### Minor Changes

- [`401868e`](https://github.com/iliesw/Lux/commit/401868edbebe68c35af9790f4f63c9bbefdb7ae7) Thanks [@iliesw](https://github.com/iliesw)! - First-class Tailwind CSS v4 support. Component `<style>` blocks now go through `@tailwindcss/vite` (`@apply`, `@variant`, `--spacing()`, ...), and the plugin adds the `@reference` to your main stylesheet for you (`lux({ tailwind })` to configure). Rules inside `@utility`, `@theme` and `@custom-variant` are not scoped. The editor knows Tailwind's directives (in `<style>` blocks and plain `.css` files), and the VS Code extension turns on Tailwind CSS IntelliSense for `.lx` files. The virtual style module is now `Foo.lx?lux&type=style&lang.css`.

### Patch Changes

- Updated dependencies [[`401868e`](https://github.com/iliesw/Lux/commit/401868edbebe68c35af9790f4f63c9bbefdb7ae7)]:
  - @inflector/lux-compiler@0.2.0

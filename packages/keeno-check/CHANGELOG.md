# @inflector/keeno-check

## 0.2.1

### Patch Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) [`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a) Thanks [@iliesw](https://github.com/iliesw)! - First published release with the 0.6.0 changes below (the 0.6.0 version itself was never published to npm).
- Updated dependencies [[`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a)]:
  - @inflector/keeno-compiler@0.6.1
  - @inflector/keeno-language-server@0.4.1

## 0.2.0

### Minor Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) Reports `use:` directive type errors (wrong value, wrong element type, missing value) with `file:line:col`.

### Patch Changes

- Updated dependencies []:
  - @inflector/keeno-compiler@0.6.0
  - @inflector/keeno-language-server@0.4.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248), [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248)]:
  - @inflector/keeno-compiler@0.5.0
  - @inflector/keeno-language-server@0.3.0

## 0.1.4

### Patch Changes

- [#12](https://github.com/iliesw/Keeno/pull/12) [`7f639a1`](https://github.com/iliesw/Keeno/commit/7f639a161b6484b8a9d1afa16474416ac548a9cc) Thanks [@iliesw](https://github.com/iliesw)! - `keeno-check` now runs the compiler on every .kn file and reports the errors `vite build` would stop on (such as an unsupported `.map()` row parameter) as `file:line:col - error keeno: …`, so a project that passes the check also builds. Compiler errors raised on a node now carry its `.kn` location (`err.loc`), which also points Vite's error overlay at the right spot.
- Updated dependencies [[`7f639a1`](https://github.com/iliesw/Keeno/commit/7f639a161b6484b8a9d1afa16474416ac548a9cc)]:
  - @inflector/keeno-compiler@0.4.1
  - @inflector/keeno-language-server@0.2.3

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @inflector/keeno-language-server@0.2.2

## 0.1.2

### Patch Changes

- [`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c) Thanks [@iliesw](https://github.com/iliesw)! - Fix correctness and security bugs:
  
  - keeno: a computation no longer runs after the condition it renders under turned false (re-running its parent first); a derived that failed on its first run notifies readers when it recovers; a throwing `onUpdate` listener no longer leaves computations stale; server rendering supports `<select>` values and `bind:checked`; dynamic inline handler attributes (`onclick` strings) are never set, and spread binds lowercase `onclick` functions as listeners; `onDoubleClick` listens to `dblclick`.
  - compiler: `</script>` inside strings, template literals and comments no longer ends the script; `<style>` inside an inline `<svg>` and data `<script>`s (JSON-LD) stay in the markup; object defaults in `props()` (`items = []`) are evaluated once.
  - router: `href('//x')` no longer gives a protocol-relative URL; `link` leaves links outside the base to the browser; URLs outside the base match no route; server-rendered `<Link>`s use their router's base; `navigate()` fires `keeno:navigate` instead of a fake `popstate`, and scrolls to `#hash` targets.
  - keeno: `<Transition>` cancels running animations when it is destroyed; `mount()` disposes the app when the first render throws; a failed `lazy()` load only affects the instances that were waiting for it; `undo()`/`redo()` keep the history when `validate` refuses the value; `<Portal>` content is included in `renderToString` output, after the app.
  - keeno performance: O(1) scheduler queues and owner removal (clearing long lists is ~30% faster), no per-row index state for `item => …` list callbacks, linear `<Transition>` merging.
  - router: restores the scroll position on back/forward.
  - keeno-check: fails when the tsconfig includes no files (e.g. a solution tsconfig).
- Updated dependencies []:
  - @inflector/keeno-language-server@0.2.1

## 0.1.1

### Patch Changes

- Updated dependencies [[`401868e`](https://github.com/iliesw/Lux/commit/401868edbebe68c35af9790f4f63c9bbefdb7ae7)]:
  - @inflector/lux-language-server@0.2.0

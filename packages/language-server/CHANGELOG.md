# @inflector/keeno-language-server

## 0.4.6

### Patch Changes

- [#33](https://github.com/iliesw/Keeno/pull/33) [`a49d54c`](https://github.com/iliesw/Keeno/commit/a49d54c3e979edc9fb620e54eec156d835718484) Thanks [@iliesw](https://github.com/iliesw)! - Components complete by name in the editor. A `.kn` file's default export is now named after the file (`todo-item.kn` is `TodoItem`), so typing `<TodoIt` offers `TodoItem` and adds its import, for every component and not only those re-exported from a `.ts` file. Accepting an auto-import now inserts the import into the `<script>` block; before, the edit was dropped.
- Updated dependencies []:
  - @inflector/keeno-compiler@0.9.0

## 0.4.5

### Patch Changes

- [#30](https://github.com/iliesw/Keeno/pull/30) [`bf81575`](https://github.com/iliesw/Keeno/commit/bf81575f7552a63f66e9680be9a374606d06ed48) Thanks [@iliesw](https://github.com/iliesw)! - Server functions. Wrap an async function in `server(…)` and it runs on the server: call it like any function, and in the browser the call becomes a typed request (`POST /_keeno/fn/<id>`). It is auto-imported in `.kn` files and imported from `@inflector/keeno` in `.ts` files. The compiler leaves the function, and the imports only it used, out of the browser bundle, and reports a server function that uses a component's variables. Arguments and results keep `Date`, `Map`, `Set`, `BigInt` and `undefined`, a `FormData` is sent as a form, and errors arrive as `ServerFunctionError` with their status. `getRequest()` and `setHeader()` from `@inflector/keeno/server` give access to the request and response. Apps with server functions build `dist/client` and `dist/server` with every render strategy, and `createHandler()` serves them, including `spa`, `ssg` and `islands` builds.
- Updated dependencies [[`bf81575`](https://github.com/iliesw/Keeno/commit/bf81575f7552a63f66e9680be9a374606d06ed48)]:
  - @inflector/keeno-compiler@0.8.0

## 0.4.4

### Patch Changes

- Updated dependencies []:
  - @inflector/keeno-compiler@0.7.1

## 0.4.3

### Patch Changes

- Updated dependencies [[`4989bf8`](https://github.com/iliesw/Keeno/commit/4989bf86e9f021be3eb9ac22af838b35b4de2564), [`d29c991`](https://github.com/iliesw/Keeno/commit/d29c9910cbb496b3130dc8ace71ff5959ec62e4c)]:
  - @inflector/keeno-compiler@0.7.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`20ef0ff`](https://github.com/iliesw/Keeno/commit/20ef0fffaa0c7ce90ef65c6cec98aae1fe48b7ba)]:
  - @inflector/keeno-compiler@0.6.2

## 0.4.1

### Patch Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) [`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a) Thanks [@iliesw](https://github.com/iliesw)! - PR
- Updated dependencies [[`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a)]:
  - @inflector/keeno-compiler@0.6.1

## 0.4.0

### Minor Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) Type-checks `use:` directives: the value against the directive's value type and the element against its element type (a `<textarea>` directive on `<input>` is an error). Hover and go to definition work on the directive name.

### Patch Changes

- Updated dependencies []:
  - @inflector/keeno-compiler@0.6.0

## 0.3.0

### Minor Changes

- [#14](https://github.com/iliesw/Keeno/pull/14) [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248) Thanks [@iliesw](https://github.com/iliesw)! - `store()`: a deep reactive object you update by plain mutation (`todos.items.push(…)`, `todo.done = true`), tracked per property. Includes `snapshot()`, `reconcile()` and `isStore()`, works with keyed lists, and `bind:value` / `bind:checked` accept store properties (`bind:value={form.user.email}`). `store` is available in `.kn` files without importing.

### Patch Changes

- Updated dependencies [[`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248), [`62e1633`](https://github.com/iliesw/Keeno/commit/62e163329431f04df5502c0b874980e7d1743248)]:
  - @inflector/keeno-compiler@0.5.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`7f639a1`](https://github.com/iliesw/Keeno/commit/7f639a161b6484b8a9d1afa16474416ac548a9cc)]:
  - @inflector/keeno-compiler@0.4.1

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @inflector/keeno-compiler@0.4.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c), [`6c85982`](https://github.com/iliesw/Keeno/commit/6c859820b58232e41d06a0592aa441f5065fd99c)]:
  - @inflector/keeno-compiler@0.3.0

## 0.2.0

### Minor Changes

- [`401868e`](https://github.com/iliesw/Lux/commit/401868edbebe68c35af9790f4f63c9bbefdb7ae7) Thanks [@iliesw](https://github.com/iliesw)! - First-class Tailwind CSS v4 support. Component `<style>` blocks now go through `@tailwindcss/vite` (`@apply`, `@variant`, `--spacing()`, ...), and the plugin adds the `@reference` to your main stylesheet for you (`lux({ tailwind })` to configure). Rules inside `@utility`, `@theme` and `@custom-variant` are not scoped. The editor knows Tailwind's directives (in `<style>` blocks and plain `.css` files), and the VS Code extension turns on Tailwind CSS IntelliSense for `.lx` files. The virtual style module is now `Foo.lx?lux&type=style&lang.css`.

### Patch Changes

- Updated dependencies [[`401868e`](https://github.com/iliesw/Lux/commit/401868edbebe68c35af9790f4f63c9bbefdb7ae7)]:
  - @inflector/lux-compiler@0.2.0

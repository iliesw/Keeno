# @inflector/keeno-language-server

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

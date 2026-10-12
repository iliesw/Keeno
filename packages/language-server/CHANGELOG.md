# @inflector/keeno-language-server

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

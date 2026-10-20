# inflector-keeno

## 0.2.1

### Patch Changes

- [#33](https://github.com/iliesw/Keeno/pull/33) [`a49d54c`](https://github.com/iliesw/Keeno/commit/a49d54c3e979edc9fb620e54eec156d835718484) Thanks [@iliesw](https://github.com/iliesw)! - Components complete by name in the editor. A `.kn` file's default export is now named after the file (`todo-item.kn` is `TodoItem`), so typing `<TodoIt` offers `TodoItem` and adds its import, for every component and not only those re-exported from a `.ts` file. Accepting an auto-import now inserts the import into the `<script>` block; before, the edit was dropped.

## 0.2.0

### Minor Changes

- [`401868e`](https://github.com/iliesw/Lux/commit/401868edbebe68c35af9790f4f63c9bbefdb7ae7) Thanks [@iliesw](https://github.com/iliesw)! - First-class Tailwind CSS v4 support. Component `<style>` blocks now go through `@tailwindcss/vite` (`@apply`, `@variant`, `--spacing()`, ...), and the plugin adds the `@reference` to your main stylesheet for you (`lux({ tailwind })` to configure). Rules inside `@utility`, `@theme` and `@custom-variant` are not scoped. The editor knows Tailwind's directives (in `<style>` blocks and plain `.css` files), and the VS Code extension turns on Tailwind CSS IntelliSense for `.lx` files. The virtual style module is now `Foo.lx?lux&type=style&lang.css`.

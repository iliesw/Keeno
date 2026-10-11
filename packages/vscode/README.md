# Lux for VS Code

Language support for [Lux](https://github.com/iliesw/Lux) `.lx` components:

- Highlighting for `<script>` (TypeScript), markup (JSX) and `<style>` (CSS).
- Completions, hover, go to definition and type errors in scripts and markup, powered by TypeScript.
  Local states read as their value, with `set`, `get`, `peek` and `onUpdate` available.
- Typed props: using a component with a missing or mistyped prop is an error, and its prop names complete.
- HTML tag, attribute and event completions, with typed event objects.
- Tailwind directives (`@apply`, `@theme`, `@utility`, `@variant`, ...) are known, with completions and hover docs, in `<style>` blocks and in plain `.css` files (no "Unknown at rule" warnings).
- Tailwind CSS IntelliSense in `.lx` files (with the Tailwind CSS extension installed).

The extension uses the TypeScript version bundled with VS Code and the types of the `@inflector/lux` package installed in your project. Install it with `bun add @inflector/lux` (or npm, pnpm or yarn).

To get the same type errors in CI, use [`@inflector/lux-check`](https://www.npmjs.com/package/@inflector/lux-check).

[Documentation](https://github.com/iliesw/Lux#documentation) · [Issues](https://github.com/iliesw/Lux/issues)

# Keeno for VS Code

Language support for [Keeno](https://github.com/iliesw/Keeno) `.kn` components:

- Highlighting for `<script>` (TypeScript), markup (JSX) and `<style>` (CSS).
- Completions, hover, go to definition and type errors in scripts and markup, powered by TypeScript.
  Local states read as their value, with `set`, `get`, `peek` and `onUpdate` available.
- Typed props: using a component with a missing or mistyped prop is an error, and its prop names complete.
- HTML tag, attribute and event completions, with typed event objects.
- Tailwind directives (`@apply`, `@theme`, `@utility`, `@variant`, ...) are known, with completions and hover docs, in `<style>` blocks and in plain `.css` files (no "Unknown at rule" warnings).
- Tailwind CSS IntelliSense in `.kn` files (with the Tailwind CSS extension installed).

The extension uses the TypeScript version bundled with VS Code and the types of the `@inflector/keeno` package installed in your project. Install it with `bun add @inflector/keeno` (or npm, pnpm or yarn).

`.kn` files get the Keeno logo with icon themes that show language icons (Seti, the default). Themes such as Material Icon Theme replace it with their own; to keep the logo there, save [`file-icon-dark.svg`](images/file-icon-dark.svg) as `~/.vscode/extensions/icons/keeno.svg` and add to your settings:

```json
"material-icon-theme.files.associations": { "*.kn": "../../icons/keeno" }
```

To get the same type errors in CI, use [`@inflector/keeno-check`](https://www.npmjs.com/package/@inflector/keeno-check).

[Documentation](https://github.com/iliesw/Keeno#documentation) · [Issues](https://github.com/iliesw/Keeno/issues)

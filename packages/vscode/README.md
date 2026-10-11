# Lux for VS Code

Syntax highlighting and IntelliSense for Lux `.lx` components:

- Highlighting for `<script>` (TypeScript), markup (JSX) and `<style>` (CSS).
- Completions, hover, go to definition and type errors in scripts and markup, powered by TypeScript.
  Local states read as their value, with `set`, `get`, `peek` and `onUpdate` available.
- HTML tag, attribute and event completions, with typed event objects.
- CSS completions in `<style>`.

Build and package from the repo with `bun run --cwd packages/vscode package`.

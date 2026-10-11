# Introduction

Lux is a compiled, signal-based frontend framework. Components are `.lx` files that hold HTML-first markup with JSX-style `{expressions}`, a `<script>` block and a scoped `<style>` block. The compiler turns each component into direct DOM code with fine-grained updates. There is no virtual DOM, and components never re-render.

```html Counter.lx
<script lang="ts">
  const count = state(0)
  const doubled = derived(() => count * 2)
</script>

<h1>Clicked {count} times ({doubled} doubled)</h1>
<button onClick={() => count.set(count + 1)}>+1</button>

<style>
  h1 { color: teal }
</style>
```

## Why Lux

- **Write HTML, not render functions.** Markup is the component. `class` and `for` work as in HTML, and expressions go in `{}`.
- **Reactivity without ceremony.** A bare `count` reads a state and tracks it, `count.set(v)` writes it. The compiler does the unwrapping, so there are no hooks rules and no dependency arrays to keep in sync.
- **Updates touch only what changed.** Each `{expression}` is its own subscription. Changing a state updates the text nodes and attributes that read it, nothing else.
- **Styles stay where they belong.** Every `<style>` is scoped to its component, with `:global()` when you need to reach out, and Tailwind CSS works out of the box.

## Features

- **Fine-grained reactivity:** `state()`, `derived()`, batched DOM updates, and `persist`, `url`, `history`, `debounce` and `validate` options on states.
- **Templates:** conditionals, keyed lists, two-way `bind:value`, class arrays and spread props.
- **Scoped CSS** per component, with a `:global()` escape hatch, and first-class [Tailwind CSS](styles.md#tailwind-css).
- **Built-in components:** error boundaries, `<Await>` for promises, `lazy()` code splitting, portals, state-preserving reparenting, enter/leave transitions and `<Dynamic>`. See [Built-in components](built-ins.md).
- **Context**, [server rendering](ssr.md) with `hydrate`, and a [router](routing.md).
- **Tooling:** a Vite plugin with HMR, a VS Code extension with full TypeScript IntelliSense in `.lx` files, and `lux-check` for type-checking in CI.

## Packages

| Package | |
|---|---|
| `@inflector/lux` | Runtime: reactivity, lifecycle, built-in components, `mount`/`hydrate`, `renderToString` (`/server`) |
| `@inflector/vite-plugin-lux` | Vite plugin: compiles `.lx` files, scoped CSS, HMR |
| `@inflector/lux-router` | Client-side router |
| `@inflector/lux-check` | Type-checks `.lx` and `.ts` files from the command line |
| `@inflector/lux-compiler` | The `.lx` compiler (used by the Vite plugin) |
| `@inflector/lux-language-server` | Volar-based language server (used by the editor extension and `lux-check`) |
| Lux for VS Code | Syntax highlighting and IntelliSense (`inflector.lux-vscode`) |

## About this site

This documentation is itself a Lux app: every page is rendered to HTML on the server with `renderToString`, then made interactive in the browser with `hydrate`. Navigation between pages uses `@inflector/lux-router`.

Ready to build something? Continue with the [Quick Start](getting-started.md).

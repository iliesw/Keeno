# Lux

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

## Quick start

```bash
bun add @inflector/lux
bun add -d vite @inflector/vite-plugin-lux
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import lux from '@inflector/vite-plugin-lux'

export default defineConfig({ plugins: [lux()] })
```

```ts
// src/main.ts
import { mount } from '@inflector/lux'
import App from './App.lx'

mount(App, document.getElementById('app')!)
```

npm, pnpm and yarn work too. Continue with [Getting started](docs/getting-started.md).

## Features

- **Fine-grained reactivity:** `state()`, `derived()`, batched DOM updates, and `persist`, `url`, `history`, `debounce` and `validate` options on states.
- **Templates:** conditionals, keyed lists, two-way `bind:value`, class arrays and spread props.
- **Scoped CSS** per component, with a `:global()` escape hatch.
- **Built-in components:** error boundaries, `<Await>` for promises, `lazy()` code splitting, portals, enter/leave transitions and `<Dynamic>`. See [Built-in components](docs/built-ins.md).
- **Context**, server rendering with `hydrate`, and a router.
- **Tooling:** a Vite plugin with HMR, a VS Code extension with full TypeScript IntelliSense in `.lx` files, and `lux-check` for type-checking in CI.

## Packages

| Package | |
|---|---|
| [`@inflector/lux`](packages/lux) | Runtime: reactivity, lifecycle, built-in components, `mount`/`hydrate`, `renderToString` (`/server`) |
| [`@inflector/vite-plugin-lux`](packages/vite-plugin-lux) | Vite plugin: compiles `.lx` files, scoped CSS, HMR |
| [`@inflector/lux-router`](packages/router) | Client-side router |
| [`@inflector/lux-check`](packages/lux-check) | Type-checks `.lx` and `.ts` files from the command line |
| [`@inflector/lux-compiler`](packages/compiler) | The `.lx` compiler (used by the Vite plugin) |
| [`@inflector/lux-language-server`](packages/language-server) | Volar-based language server (used by the editor extension and `lux-check`) |
| [Lux for VS Code](packages/vscode) | Syntax highlighting and IntelliSense (`inflector.lux-vscode`) |

## Documentation

[Getting started](docs/getting-started.md) · [Components](docs/components.md) · [Reactivity](docs/reactivity.md) · [State options](docs/state-options.md) · [Templates](docs/templates.md) · [Styles](docs/styles.md) · [Context](docs/context.md) · [Built-in components](docs/built-ins.md) · [Routing](docs/routing.md) · [Server rendering](docs/ssr.md) · [Security](docs/security.md) · [Tooling](docs/tooling.md) · [API reference](docs/api.md) · [Versioning and support](docs/stability.md)

[`llms.txt`](llms.txt) and [`llms-full.txt`](llms-full.txt) summarize the docs for AI assistants.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately, as [docs/security.md](docs/security.md) describes.

## License

[MIT](LICENSE)

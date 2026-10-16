# Keeno

Keeno is a compiled, signal-based frontend framework. Components are `.kn` files that hold HTML-first markup with JSX-style `{expressions}`, a `<script>` block and a scoped `<style>` block. The compiler turns each component into direct DOM code with fine-grained updates. There is no virtual DOM, and components never re-render.

```html Counter.kn
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
bun create keeno my-app
```

(`npm create keeno@latest`, `pnpm create keeno` and `yarn create keeno` work too.) Or add Keeno to an existing Vite project:

```bash
bun add @inflector/keeno
bun add -d vite @inflector/vite-plugin-keeno
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import keeno from '@inflector/vite-plugin-keeno'

export default defineConfig({ plugins: [keeno()] })
```

```ts
// src/main.ts
import { mount } from '@inflector/keeno'
import App from './App.kn'

mount(App, document.getElementById('app')!)
```

npm, pnpm and yarn work too. Continue with [Getting started](docs/getting-started.md).

## Features

- **Fine-grained reactivity:** `state()`, `derived()`, batched DOM updates, and `persist`, `url`, `history`, `debounce` and `validate` options on states.
- **Async data:** `derived(async () => …)` with `<Loading>` boundaries, stale-while-revalidate refetching, `refresh()` and `pending()`.
- **Deep stores:** `store()` for nested data you mutate directly (`todos.items.push(…)`), tracked per property, with `snapshot()` and `reconcile()`.
- **Templates:** conditionals, keyed lists, two-way `bind:value`, class arrays, spread props, and `use:` [directives](docs/directives.md) for reusable DOM behaviors.
- **Scoped CSS** per component, with a `:global()` escape hatch, and first-class [Tailwind CSS](docs/styles.md#tailwind-css) (utilities in markup, `@apply` in `<style>`).
- **Built-in components:** error boundaries, `<Loading>` for async data, `<Await>` for promises, `lazy()` code splitting, portals, state-preserving reparenting (native `moveBefore`), enter/leave transitions and `<Dynamic>`. See [Built-in components](docs/built-ins.md).
- **Server functions:** `server(async (id) => db.find(id))` runs on the server and is called from the browser like a normal function, typed, with no API route to write. See [Server functions](docs/server-functions.md).
- **Context**, server rendering that waits for async data and can stream (`renderToString`, `renderToStream`, `hydrate`), and a router with View Transitions.
- **Tooling:** a Vite plugin with HMR, a VS Code extension with full TypeScript IntelliSense in `.kn` files, and `keeno-check` for type-checking in CI.

## Packages

| Package | |
|---|---|
| [`@inflector/keeno`](packages/keeno) | Runtime: reactivity, stores, lifecycle, directives, built-in components, `mount`/`hydrate`, `renderToString`/`renderToStream` (`/server`) |
| [`@inflector/vite-plugin-keeno`](packages/vite-plugin-keeno) | Vite plugin: compiles `.kn` files, scoped CSS, HMR |
| [`@inflector/keeno-router`](packages/router) | Client-side router, with View Transitions |
| [`@inflector/keeno-check`](packages/keeno-check) | Type-checks `.kn` and `.ts` files from the command line |
| [`create-keeno`](packages/create-keeno) | Scaffolds a new project: `bun create keeno` |
| [`@inflector/keeno-compiler`](packages/compiler) | The `.kn` compiler (used by the Vite plugin) |
| [`@inflector/keeno-language-server`](packages/language-server) | Volar-based language server (used by the editor extension and `keeno-check`) |
| [Keeno for VS Code](packages/vscode) | Syntax highlighting and IntelliSense (`inflector.inflector-keeno`) |

## Documentation

[Getting started](docs/getting-started.md) · [Components](docs/components.md) · [Reactivity](docs/reactivity.md) · [State options](docs/state-options.md) · [Templates](docs/templates.md) · [Directives](docs/directives.md) · [Styles](docs/styles.md) · [Context](docs/context.md) · [Built-in components](docs/built-ins.md) · [Routing](docs/routing.md) · [Server functions](docs/server-functions.md) · [Server rendering](docs/ssr.md) · [Security](docs/security.md) · [Tooling](docs/tooling.md) · [API reference](docs/api.md) · [Versioning and support](docs/stability.md)

[`llms.txt`](llms.txt) and [`llms-full.txt`](llms-full.txt) summarize the docs for AI assistants.

### Claude Code skill

The `keeno` plugin gives Claude Code a skill with Keeno's rules and the full docs, so it writes `.kn` components correctly. Install it in Claude Code:

```
/plugin install keeno --marketplace iliesw/Keeno
```

On older Claude Code versions, add the marketplace first: `/plugin marketplace add iliesw/Keeno`, then `/plugin install keeno@keeno`. The skill lives in [`claude-plugin/`](claude-plugin); `bun run docs:llms` keeps its copy of the docs current.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately, as [docs/security.md](docs/security.md) describes.

## License

[MIT](LICENSE)

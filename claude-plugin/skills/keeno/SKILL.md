---
name: keeno
description: Write, edit, debug and review Keeno apps — the compiled, signal-based frontend framework with `.kn` components (packages `@inflector/keeno`, `@inflector/vite-plugin-keeno`, `@inflector/keeno-router`, `create-keeno`). Use whenever a project has `.kn` files or depends on `@inflector/*` Keeno packages, or the user asks to build something with Keeno, even if they don't name the skill. Covers state/derived/store reactivity, templates, lifecycle, built-in components, routing, file-based routing, server functions, SSR and tooling.
---

# Keeno

Keeno is a compiled, signal-based frontend framework. Components are `.kn` files with HTML-first JSX-style markup, a `<script>` block and a scoped `<style>` block. The compiler (via `@inflector/vite-plugin-keeno`) turns them into direct DOM code with fine-grained updates: no virtual DOM, components never re-render. Tooling is Bun (packages, scripts, `bun test`) plus Vite.

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

New project: `bun create keeno my-app` (or `npm create keeno@latest`). Dev server: `bunx --bun vite`. Type-check: `bunx keeno-check`.

## Rules that differ from React, Svelte and Vue

These are the mistakes models make most often. Check every `.kn` file you write against them.

- **Reading state:** in `.kn` files, read a local state by name (`count`), not `count()` or `count.value`. Write with `count.set(v)`, never `count = v`.
- **Reserved members:** `x.set`, `x.get`, `x.peek`, `x.onUpdate`, `x.undo`, `x.redo`, `x.canUndo` and `x.canRedo` stay on the state. Any other member (`x.length`, `x.map`) reads the value.
- **Immutable updates:** `todos.set([...todos, item])`. In-place mutation (`todos.push`) does not update anything. For deep data you want to mutate directly, use `store()` instead.
- **Computed values:** use `derived(() => …)`. Don't copy values between states in `update()`.
- **Shared stores:** in plain `.ts` files, states are plain objects (`s.get()`, `s.set()`), and imported stores stay that way in components.
- **Props:** `const { a, b = 1 } = props()` stays reactive. No `...rest`; use `const p = props()` instead.
- **Markup:** `class`, not `className` (both work). Use `onClick={fn}`, not `@click` or `on:click`. Two-way binding is `bind:value={state}`.
- **Lists:** `{list.map(item => <li key={item.id}>…</li>)}` is keyed. The callback must return JSX directly.
- **Lifecycle:** `init(fn)` runs after mount and its return value is cleanup. `update(fn)` runs when a value read inside `fn` changes (deps inferred by the compiler), and `update(fn, [a, b])` only when `a` or `b` changes; neither runs on mount. `destroy(fn)` runs on unmount.
- **Globals:** in `.kn` files `state`, `derived`, `store`, `props`, `init`, `update`, `destroy` and `ref` need no import. Everything else comes from `@inflector/keeno`.
- **State options:** `persist`, `url`, `history`, `equals`, `validate`, `debounce` and `throttle`.
- **Async data:** `derived(async ({ signal }) => …)` wrapped in a `<Loading>` boundary; `pending(fn)` and `x.refresh()`.
- **Built-ins:** `ErrorBoundary`, `Await`, `Dynamic`, `Portal`, `Transition`, `lazy()` and `reparentable()` are imported from `@inflector/keeno`. Render props such as `fallback={(error, reset) => <p>…</p>}` and `fulfilled={(value) => …}` are functions.
- **Reparenting:** `const player = reparentable(() => <Video />)` and render `{player}` wherever it should be now. Use `keyedReparentable((id) => <Card id={id} />)` for items moving between lists.
- **Context:** `provide(Ctx, value)` and `inject(Ctx)` are called in `<script>`. To make the value reactive, provide a state. An injected state is a plain object, so use `.get()`.
- **Server functions:** `server(async (id) => db.find(id))` runs on the server and is called from the browser like a normal function. No API route needed.
- **Packages:** `@inflector/keeno` (runtime), `@inflector/keeno/server` (`renderToString`, `renderToStream`), `@inflector/keeno-router`, `@inflector/vite-plugin-keeno` and `@inflector/keeno-check`.

## Reference docs

Read the doc for the area you are working in before writing code. They are the project's own docs, copied into `references/`.

| Topic | File |
|---|---|
| Setup with Bun and Vite, first component, mounting | [getting-started.md](references/getting-started.md) |
| Script, markup, style; props, children, lifecycle | [components.md](references/components.md) |
| state, derived, async derived, `store()`, batching | [reactivity.md](references/reactivity.md) |
| persist, url, history, equals, validate, debounce, throttle | [state-options.md](references/state-options.md) |
| Expressions, conditionals, keyed lists, events, bind, class arrays, spread | [templates.md](references/templates.md) |
| `use:` directives | [directives.md](references/directives.md) |
| Scoped CSS, `:global()`, Tailwind | [styles.md](references/styles.md) |
| createContext, provide, inject | [context.md](references/context.md) |
| ErrorBoundary, Loading, Await, lazy, Dynamic, Portal, reparentable, Transition | [built-ins.md](references/built-ins.md) |
| Router, Link, navigate, useRoute, View Transitions | [routing.md](references/routing.md) |
| `src/pages` routes, layouts, page data, 404/500 | [file-routing.md](references/file-routing.md) |
| `server()` functions, `getRequest()`, `createHandler()` | [server-functions.md](references/server-functions.md) |
| renderToString, renderToStream, hydrate, Vite SSR | [ssr.md](references/ssr.md) |
| Escaping, innerHTML, javascript: URLs, CSP | [security.md](references/security.md) |
| Vite plugin, HMR, VS Code, keeno-check, `bun test` | [tooling.md](references/tooling.md) |
| Every export and the compile rules | [api.md](references/api.md) |
| Semver, supported browsers, Node and Vite | [stability.md](references/stability.md) |

## Workflow

1. Check `package.json` for the Keeno packages and `vite.config.ts` for the plugin options (`renderStrategy`, file routing) before changing structure.
2. Write components against the rules above; open the matching reference when touching an area you haven't checked yet.
3. Verify with `keeno-check` (`@inflector/keeno-check`; usually a `check` script) (types in `.kn` and `.ts`) and the project's tests (`bun test`), then the dev server when the change is visible.

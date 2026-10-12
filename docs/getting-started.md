# Getting started

Keeno is a compiled, signal-based frontend framework. You write components in `.kn` files: HTML-first markup with JSX-style `{expressions}`, a `<script>` block, and a scoped `<style>` block. The compiler turns each file into direct DOM code with fine-grained updates. There is no virtual DOM.

## Project setup

Keeno uses Bun for packages, scripts and tests, and Vite for the dev server and builds.

The quickest start is the project generator. It asks for a directory, a template (file-based routing or a single component) and whether to add Tailwind CSS:

```bash
bun create keeno my-app
```

To set a project up by hand instead:

```bash
bun add @inflector/keeno
bun add -d vite @inflector/vite-plugin-keeno
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import keeno from '@inflector/vite-plugin-keeno'

export default defineConfig({
  plugins: [keeno()],
})
```

`index.html`:

```html
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

`src/main.ts`:

```ts
import { mount } from '@inflector/keeno'
import App from './App.kn'

mount(App, document.getElementById('app')!)
```

`src/env.d.ts`, so plain `.ts` files can import `.kn` files:

```ts
declare module '*.kn' {
  const Component: import('@inflector/keeno').Component
  export default Component
}
```

Start the dev server with `bunx --bun vite` and build with `bunx --bun vite build`.

## A first component

```html App.kn
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

- `state(0)` creates a reactive value. Inside `.kn` files you read it by name (`count`) and write it with `count.set(…)`.
- `derived(…)` computes a value from other states and stays up to date automatically.
- `{count}` in the markup is a live text node: only that node changes when `count` changes.
- The `<style>` only applies to this component.

Continue with [Components](components.md), [Reactivity](reactivity.md) and [Templates](templates.md).

# Getting started

Lux is a compiled, signal-based frontend framework. You write components in `.lx` files: HTML-first markup with JSX-style `{expressions}`, a `<script>` block, and a scoped `<style>` block. The compiler turns each file into direct DOM code with fine-grained updates. There is no virtual DOM.

## Project setup

Lux uses Bun for packages, scripts and tests, and Vite for the dev server and builds.

```bash
bun add @inflector/lux
bun add -d vite @inflector/vite-plugin-lux
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import lux from '@inflector/vite-plugin-lux'

export default defineConfig({
  plugins: [lux()],
})
```

`index.html`:

```html
<div id="app"></div>
<script type="module" src="/src/main.ts"></script>
```

`src/main.ts`:

```ts
import { mount } from '@inflector/lux'
import App from './App.lx'

mount(App, document.getElementById('app')!)
```

`src/env.d.ts`, so plain `.ts` files can import `.lx` files:

```ts
declare module '*.lx' {
  const Component: import('@inflector/lux').Component
  export default Component
}
```

Start the dev server with `bunx --bun vite` and build with `bunx --bun vite build`.

## A first component

```html App.lx
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

- `state(0)` creates a reactive value. Inside `.lx` files you read it by name (`count`) and write it with `count.set(…)`.
- `derived(…)` computes a value from other states and stays up to date automatically.
- `{count}` in the markup is a live text node: only that node changes when `count` changes.
- The `<style>` only applies to this component.

Continue with [Components](components.md), [Reactivity](reactivity.md) and [Templates](templates.md).

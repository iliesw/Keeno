# Styles

The `<style>` block of a component is scoped to it.

- **Scope class:** each component gets a class `keeno-<hash of the file path>`. Every element in its markup gets that class, and every compound selector in its CSS gets it too: `h1 { … }` becomes `h1.keeno-1a2b3c4d { … }`, and `ul > li.done` becomes `ul.keeno-… > li.done.keeno-…`.
- **Escape hatch:** `:global(...)` is left as written: `:global(body) { margin: 0 }` and `:global(.dark) h1 { … }`.
- **Pseudo-classes and pseudo-elements:** the scope class goes before them (`a:hover` becomes `a.keeno-…:hover`).
- **At-rules:** `@media` rules are scoped. `@keyframes` steps are not.

```html Panel.kn
<div class="panel"><h2>Title</h2></div>

<style>
  .panel { padding: 1rem }
  h2 { color: teal }              /* only this component's h2 */
  :global(body) { margin: 0 }     /* global */
</style>
```

Styles don't leak between components, and parent styles don't reach into children. Dynamic `class` values keep the scope class. The router's `<Link>` is an exception: its `<a>` gets the scope class of the component that renders it, as if you had written the `<a>` yourself.

## Tailwind CSS

Keeno works with Tailwind CSS v4. Add `@tailwindcss/vite` next to the Keeno plugin and import Tailwind from a stylesheet:

```bash
bun add -d tailwindcss @tailwindcss/vite
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import keeno from '@inflector/vite-plugin-keeno'

export default defineConfig({ plugins: [keeno(), tailwindcss()] })
```

```css
/* src/app.css, imported once from main.ts */
@import 'tailwindcss';
```

- **Utilities in markup:** Tailwind scans `.kn` files, so classes in `class="…"` and in `class={[…]}` arrays and ternaries are generated. Write class names in full (`'bg-red-500'`, not `` `bg-${color}-500` ``).
- **Directives in `<style>`:** `@apply`, `@variant`, `theme()`, `--theme()`, `--spacing()` and `--alpha()` work in component styles, and the result stays scoped.
- **No `@reference` needed:** a component style that uses Tailwind gets `@reference` to your main stylesheet added for you. That's the shallowest `.css` file in the project that imports `tailwindcss`, so your `@theme` tokens are available. Write your own `@reference` to choose another file, or set `keeno({ tailwind: { reference: 'src/app.css' } })`.
- **Not scoped:** rules inside `@utility`, `@theme` and `@custom-variant`, which define global things.

```html Button.kn
<script lang="ts">
  import type { Children } from '@inflector/keeno'
  const { children } = props<{ children: Children }>()
</script>

<button class="btn">{children}</button>

<style>
  .btn {
    @apply rounded-lg bg-sky-600 px-4 py-2 text-white;
    @variant hover {
      @apply bg-sky-700;
    }
  }
</style>
```

This is on whenever `@tailwindcss/vite` is in the plugins. Turn it off with `keeno({ tailwind: false })`. For editor support, see [Tooling](tooling.md#tailwind-css-intellisense). `examples/todo` is a complete app.

## Virtual CSS module

The CSS is served as a virtual module (`Foo.kn?keeno&type=style&lang.css`). Vite injects it in dev with hot updates and extracts it in builds.

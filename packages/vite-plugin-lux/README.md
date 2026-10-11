# @inflector/vite-plugin-lux

[Vite](https://vite.dev) plugin for [Lux](https://github.com/iliesw/Lux). It compiles `.lx` components, serves their scoped CSS, adds hot module replacement in development, and turns on Lux's development warnings during `vite dev`. It supports Vite 5, 6, 7 and 8, client and SSR builds.

```bash
bun add -d vite @inflector/vite-plugin-lux
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import lux from '@inflector/vite-plugin-lux'

export default defineConfig({ plugins: [lux()] })
```

Options:
- `hmr?: boolean`: hot module replacement (default on).
- `tailwind?: boolean | { reference?: string }`: Tailwind CSS v4 in component `<style>` blocks (`@apply`, `@variant`, `--spacing()`, ...), with the `@reference` to your main stylesheet added for you. On by default when `@tailwindcss/vite` is in the plugins:

```ts
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ plugins: [lux(), tailwindcss()] })
```

To type `.lx` imports in `.ts` files, add a `src/env.d.ts`:

```ts
declare module '*.lx' {
  const Component: import('@inflector/lux').Component
  export default Component
}
```

See [Tooling](https://github.com/iliesw/Lux/blob/main/docs/tooling.md). MIT license.

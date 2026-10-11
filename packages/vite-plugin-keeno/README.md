# @inflector/vite-plugin-keeno

[Vite](https://vite.dev) plugin for [Keeno](https://github.com/iliesw/Keeno). It compiles `.kn` components, serves their scoped CSS, adds hot module replacement in development, and turns on Keeno's development warnings during `vite dev`. It supports Vite 5, 6, 7 and 8, client and SSR builds.

```bash
bun add -d vite @inflector/vite-plugin-keeno
```

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import keeno from '@inflector/vite-plugin-keeno'

export default defineConfig({ plugins: [keeno()] })
```

Options:
- `hmr?: boolean`: hot module replacement (default on).
- `tailwind?: boolean | { reference?: string }`: Tailwind CSS v4 in component `<style>` blocks (`@apply`, `@variant`, `--spacing()`, ...), with the `@reference` to your main stylesheet added for you. On by default when `@tailwindcss/vite` is in the plugins:

```ts
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({ plugins: [keeno(), tailwindcss()] })
```

To type `.kn` imports in `.ts` files, add a `src/env.d.ts`:

```ts
declare module '*.kn' {
  const Component: import('@inflector/keeno').Component
  export default Component
}
```

See [Tooling](https://github.com/iliesw/Keeno/blob/main/docs/tooling.md). MIT license.

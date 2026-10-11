# @inflector/lux

The runtime of [Lux](https://github.com/iliesw/Lux), a compiled, signal-based frontend framework: reactivity (`state`, `derived`), lifecycle (`init`, `update`, `destroy`), context, built-in components (`ErrorBoundary`, `Await`, `lazy`, `Dynamic`, `Portal`, `Transition`), `mount` and `hydrate`, and server rendering (`@inflector/lux/server`).

```bash
bun add @inflector/lux
bun add -d vite @inflector/vite-plugin-lux
```

```ts
import { mount } from '@inflector/lux'
import App from './App.lx'

mount(App, document.getElementById('app')!)
```

Components are `.lx` files compiled by [`@inflector/vite-plugin-lux`](https://www.npmjs.com/package/@inflector/vite-plugin-lux). In plain `.ts` files, states are ordinary objects: `const n = state(0); n.set(n.get() + 1)`.

`renderToString` from `@inflector/lux/server` needs the optional peer dependency `linkedom`.

- [Getting started](https://github.com/iliesw/Lux/blob/main/docs/getting-started.md)
- [API reference](https://github.com/iliesw/Lux/blob/main/docs/api.md)
- [All docs](https://github.com/iliesw/Lux/blob/main/README.md#documentation)

MIT license.

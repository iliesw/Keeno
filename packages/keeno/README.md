# @inflector/keeno

The runtime of [Keeno](https://github.com/iliesw/Keeno), a compiled, signal-based frontend framework: reactivity (`state`, `derived`), lifecycle (`init`, `update`, `destroy`), context, built-in components (`ErrorBoundary`, `Await`, `lazy`, `Dynamic`, `Portal`, `Transition`), reparenting (`reparentable`, `keyedReparentable`), `mount` and `hydrate`, and server rendering (`@inflector/keeno/server`).

```bash
bun add @inflector/keeno
bun add -d vite @inflector/vite-plugin-keeno
```

```ts
import { mount } from '@inflector/keeno'
import App from './App.kn'

mount(App, document.getElementById('app')!)
```

Components are `.kn` files compiled by [`@inflector/vite-plugin-keeno`](https://www.npmjs.com/package/@inflector/vite-plugin-keeno). In plain `.ts` files, states are ordinary objects: `const n = state(0); n.set(n.get() + 1)`.

`renderToString` from `@inflector/keeno/server` needs the optional peer dependency `linkedom`.

- [Getting started](https://github.com/iliesw/Keeno/blob/main/docs/getting-started.md)
- [API reference](https://github.com/iliesw/Keeno/blob/main/docs/api.md)
- [All docs](https://github.com/iliesw/Keeno/blob/main/README.md#documentation)

MIT license.

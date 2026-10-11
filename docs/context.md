# Context

Context passes a value from a component to everything rendered inside it, however deep, without threading it through props. Typical uses are a theme, the current user or a store.

```ts
// theme.ts
import { createContext, state, type State } from '@inflector/lux'

export const Theme = createContext<State<'light' | 'dark'>>(state('light'))
```

A component provides a value with `provide(context, value)`:

```html App.lx
<script lang="ts">
  import { provide, state } from '@inflector/lux'
  import { Theme } from './theme'
  import Toolbar from './Toolbar.lx'
  const theme = state<'light' | 'dark'>('dark')
  provide(Theme, theme)
</script>

<button onClick={() => theme.set(theme === 'dark' ? 'light' : 'dark')}>Switch</button>
<Toolbar />
```

Any component inside it reads the value with `inject(context)`:

```html Toolbar.lx
<script lang="ts">
  import { inject } from '@inflector/lux'
  import { Theme } from './theme'
  const theme = inject(Theme)
</script>

<nav class={theme.get()}>…</nav>
```

- `inject` returns the value from the closest component that provided one, or else the context's default value. `createContext()` without a default gives `undefined`.
- Call `provide` and `inject` in the `<script>` block, while the component is being created. Event handlers, timers and promise callbacks run outside the component tree, so `inject` there only sees the default.
- Context values are not reactive by themselves. To share something that changes, provide a state (as above) or an object of states. An injected state is a plain object, like a state imported from a `.ts` file, so read it with `.get()` and write it with `.set()`.
- Context reaches everything a component renders: children passed as markup, keyed list rows, `<Portal>` content and components loaded with `lazy()`.

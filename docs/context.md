# Context

Context passes a value from a component to everything rendered inside it, however deep, without threading it through props. Typical uses are a theme, the current user or a store.

## Creating a context

`createContext(defaultValue)` creates a context. Give it a type, and the default that `inject` returns when no component provided a value:

```ts
// theme.ts
import { createContext } from '@inflector/keeno'

export const Theme = createContext<'light' | 'dark'>('light')
```

## Providing a value

A component provides a value with `provide(context, value)`:

```html App.kn
<script lang="ts">
  import { provide, state } from '@inflector/keeno'
  import { Theme } from './theme'
  import Toolbar from './Toolbar.kn'
  const theme = state<'light' | 'dark'>('dark')
  provide(Theme, theme)
</script>

<button onClick={() => theme.set(theme === 'dark' ? 'light' : 'dark')}>Switch</button>
<Toolbar />
```

## Reading a value

Any component inside it reads the value with `inject(context)`:

```html Toolbar.kn
<script lang="ts">
  import { inject } from '@inflector/keeno'
  import { Theme } from './theme'
  const theme = inject(Theme)
</script>

<nav class={theme}>…</nav>
```

## Rules

- `inject` returns the value from the closest component that provided one, or else the context's default value. `createContext()` without a default gives `undefined`.
- Call `provide` and `inject` in the `<script>` block, while the component is being created. Event handlers, timers and promise callbacks run outside the component tree, so `inject` there only sees the default.

## Reactive values

Context values are reactive. In a `.kn` file:

- `provide(Theme, theme)` with a state or a derived provides the state itself, not its current value.
- `provide(User, { name, role })`, or any other expression that reads states or props, is provided as `derived(() => …)`, so it follows them.
- `const theme = inject(Theme)` reads like a state: `{theme}` and `theme.foo` are tracked. When a state was provided, `theme.set(…)` writes to it. Other values are read-only.

In a `.ts` file, `inject` returns exactly what was provided: a state or derived (call `.get()`), or a plain value.

## Where context reaches

Context reaches everything a component renders: children passed as markup, keyed list rows, `<Portal>` content and components loaded with `lazy()`.

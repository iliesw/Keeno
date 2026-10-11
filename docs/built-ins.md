# Built-in components

`@inflector/lux` exports a few components for things plain markup can't express: catching errors, waiting for promises, loading code on demand, rendering elsewhere in the page, and animating elements in and out. Import them like any component.

## ErrorBoundary

An error thrown while a component renders, updates or mounts (including inside `init` and `update`) goes to the closest `<ErrorBoundary>`, which shows `fallback` instead of its children:

```html App.lx
<script lang="ts">
  import { ErrorBoundary } from '@inflector/lux'
  import Chart from './Chart.lx'
</script>

<ErrorBoundary
  fallback={(error, reset) => (
    <div class="error">
      <p>Something went wrong: {String(error)}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )}
  onError={(error) => console.error(error)}
>
  <Chart />
</ErrorBoundary>
```

- `fallback` is either content (`fallback="Failed"`) or a function of the error and `reset`. `reset()` renders the children again from scratch.
- `onError` is called once for each caught error, which makes it a good place to report to an error tracker.
- An error thrown by the fallback itself goes to the next boundary up.
- Errors in event handlers, timers and promise callbacks are **not** caught, because they don't happen while rendering. Handle them where they happen, or store them in a state and throw it while rendering.
- Without a boundary, the error is thrown from `mount()`, or reported as an uncaught error if it happens during a later update. The rest of the app keeps working.

A `derived` that throws passes the error on to whatever reads it, and it recovers on its own once its sources change.

## Await

`<Await>` renders the states of a promise:

```html User.lx
<script lang="ts">
  import { Await } from '@inflector/lux'
  const { id } = props<{ id: number }>()
  const load = (id: number) => fetch(`/api/users/${id}`).then((r) => r.json() as Promise<{ name: string }>)
</script>

<Await
  promise={load(id)}
  pending={() => <p>Loading…</p>}
  fulfilled={(user) => <h1>{user.name}</h1>}
  rejected={(error) => <p class="error">{String(error)}</p>}
/>
```

- When `id` changes, `load(id)` runs again and `pending` shows until the new promise settles. Results from a promise that was replaced in the meantime are ignored.
- Without `rejected`, a rejection goes to the closest `<ErrorBoundary>`.
- A plain value instead of a promise renders `fulfilled` right away.

## lazy

`lazy()` loads a component when it is first rendered, so it ends up in its own chunk:

```ts
import { lazy } from '@inflector/lux'

export const Chart = lazy(() => import('./Chart.lx'), { pending: () => 'Loading chart…' })
```

Use `Chart` like any other component. `Chart.preload()` starts loading earlier, for example on hover. If loading fails, the error goes to the closest `<ErrorBoundary>`, and rendering the component again (for example with `reset()`) retries the load.

## Dynamic

`<Dynamic>` renders whatever component is in its `component` prop and passes it the other props. It creates a new instance when `component` changes:

```html Tabs.lx
<script lang="ts">
  import { Dynamic } from '@inflector/lux'
  import Profile from './Profile.lx'
  import Settings from './Settings.lx'
  const tabs = { profile: Profile, settings: Settings }
  const tab = state<keyof typeof tabs>('profile')
</script>

<button onClick={() => tab.set('profile')}>Profile</button>
<button onClick={() => tab.set('settings')}>Settings</button>
<Dynamic component={tabs[tab]} user="ada" />
```

## Portal

`<Portal>` renders its children at the end of another element. This is useful for modals, toasts and popovers that must escape `overflow: hidden` or stacking contexts:

```html Modal.lx
<script lang="ts">
  import { Portal } from '@inflector/lux'
  import type { Children } from '@inflector/lux'
  const { onClose, children } = props<{ onClose: () => void; children?: Children }>()
</script>

<Portal target="body">
  <div class="backdrop" onClick={onClose}>
    <div class="modal" onClick={(e) => e.stopPropagation()}>{children?.()}</div>
  </div>
</Portal>

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.4) }
</style>
```

- `target` is an element or a CSS selector. It defaults to `document.body`, and is read once, when the portal is created.
- The children stay part of this component: its scoped styles, context, error boundaries and `destroy` all apply, and their nodes are removed when the portal is destroyed.
- DOM events bubble through the real DOM, that is through the target and not through the portal's position in the tree.

## Transition

`<Transition>` animates elements as they are added and removed inside it. Elements that are being removed stay in place until their animation ends.

```html Panel.lx
<script lang="ts">
  import { Transition } from '@inflector/lux'
  const open = state(false)
</script>

<button onClick={() => open.set(!open)}>Toggle</button>
<Transition name="fade">{open && <div class="panel">Hello</div>}</Transition>

<style>
  .fade-enter-active, .fade-leave-active { transition: opacity 200ms }
  .fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
```

An entering element gets the classes `{name}-enter-from` and `{name}-enter-active` first. One frame later, `{name}-enter-from` is swapped for `{name}-enter-to`, and all three are removed when the longest transition or animation on the element ends. Leaving works the same way with `leave`. The default `name` is `lux`.

- `appear`: also animate the elements present on first render.
- `onEnter(el, done)` / `onLeave(el, done)`: animate with JavaScript (for example the Web Animations API) instead of classes. Call `done()` when finished.
- This works for conditionals, ternaries (the old and new element animate at the same time) and keyed lists.
- A dynamic `class={…}` on an animated element replaces its class list, which drops the transition classes. Animate a wrapper element instead.

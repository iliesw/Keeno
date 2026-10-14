# Built-in components

`@inflector/keeno` exports a few components for things plain markup can't express: catching errors, waiting for async data and promises, loading code on demand, rendering elsewhere in the page, setting the document's title and meta tags, moving live content around without re-creating it, and animating elements in and out. Import them like any component.

## ErrorBoundary

An error thrown while a component renders, updates or mounts (including inside `init` and `update`) goes to the closest `<ErrorBoundary>`, which shows `fallback` instead of its children:

```html App.kn
<script lang="ts">
  import { ErrorBoundary } from '@inflector/keeno'
  import Chart from './Chart.kn'
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

## Loading

`<Loading>` shows `fallback` while an [async derived](reactivity.md#async-derived) read by its children has no value yet:

```html Profile.kn
<script lang="ts">
  import { Loading } from '@inflector/keeno'
  const user = derived(async () => (await fetch('/api/me')).json())
</script>

<Loading fallback={() => <Spinner />}>
  <h1>{user.name}</h1>
  <Settings />
</Loading>
```

- The children are created once. While the fallback shows they stay alive off-screen, so `<Settings />` keeps its state.
- Only the first load shows the fallback. Re-runs keep the current content; use `pending()` to show that something is refreshing.
- Nested `<Loading>` boundaries each wait for what is read inside them.
- Errors pass through to the closest `<ErrorBoundary>`, which can sit inside or outside it.
- An async value read outside any `<Loading>` renders nothing until it resolves, with a warning in development.

## Await

`<Await>` renders the states of a promise. For data that depends on states or props, an [async derived](reactivity.md#async-derived) with `<Loading>` is usually simpler.

```html User.kn
<script lang="ts">
  import { Await } from '@inflector/keeno'
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
import { lazy } from '@inflector/keeno'

export const Chart = lazy(() => import('./Chart.kn'), { pending: () => 'Loading chart…' })
```

Use `Chart` like any other component. `Chart.preload()` starts loading earlier, for example on hover. If loading fails, the error goes to the closest `<ErrorBoundary>`, and rendering the component again (for example with `reset()`) retries the load.

## Dynamic

`<Dynamic>` renders whatever component is in its `component` prop and passes it the other props. It creates a new instance when `component` changes:

```html Tabs.kn
<script lang="ts">
  import { Dynamic } from '@inflector/keeno'
  import Profile from './Profile.kn'
  import Settings from './Settings.kn'
  const tabs = { profile: Profile, settings: Settings }
  const tab = state<keyof typeof tabs>('profile')
</script>

<button onClick={() => tab.set('profile')}>Profile</button>
<button onClick={() => tab.set('settings')}>Settings</button>
<Dynamic component={tabs[tab]} user="ada" />
```

## Portal

`<Portal>` renders its children at the end of another element. This is useful for modals, toasts and popovers that must escape `overflow: hidden` or stacking contexts:

```html Modal.kn
<script lang="ts">
  import { Portal } from '@inflector/keeno'
  import type { Children } from '@inflector/keeno'
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
- With `renderToString`, portal content is appended after the app's HTML, each portal in a `<div data-keeno-portal="…">` (the selector, if `target` was one). `hydrate` replaces it and renders the portal at its target.
- DOM events bubble through the real DOM, that is through the target and not through the portal's position in the tree.

## Head

`<Head>` puts `<title>`, `<meta>`, `<link>` and `<base>` tags in the document's `<head>`, from any component:

```html Post.kn
<script lang="ts">
  import { Head } from '@inflector/keeno'
  const { post } = props<{ post: Post }>()
</script>

<Head>
  <title>{post.title} · Blog</title>
  <meta name="description" content={post.summary} />
  <meta property="og:title" content={post.title} />
</Head>
<article>…</article>
```

- **Reactive:** text and attributes update like any template.
- **Deepest wins:** tags that name the same thing (the `title`, a `meta` per `name` or `property`, the canonical `link`, `base`) come from the most recently created `<Head>`, so a page overrides its layout. When the page unmounts, the layout's tags come back. Other tags, such as stylesheet links, add up.
- **Static tags:** a `<title>` already in `index.html` is a default. It is replaced while a `<Head>` sets one, and restored after.
- **Conditionals:** put them around the `<Head>` (`{draft && <Head>…</Head>}`) or inside it.
- **Server rendering:** the tags are collected into `context.head` instead (see [Server rendering](ssr.md#head-and-status)). On hydration the client replaces them with its own.

## reparentable

`reparentable()` renders content once and lets you show it in different places while it keeps its state: the same component instances and the same DOM nodes move, instead of being destroyed in one place and created again in another. Put the handle in markup wherever the content should appear now:

```html Lesson.kn
<script lang="ts">
  import { reparentable } from '@inflector/keeno'
  import Video from './Video.kn'
  const { src } = props<{ src: string }>()
  const theater = state(false)
  const player = reparentable(() => <Video src={src} />)
</script>

{theater ? <dialog open class="theater">{player}</dialog> : <aside class="inline">{player}</aside>}
<button onClick={() => theater.set(!theater)}>Theater mode</button>
```

In browsers with the native [`moveBefore`](https://developer.mozilla.org/docs/Web/API/Element/moveBefore) (Chrome and Edge 133+ and recent Firefox, not yet Safari), the move also keeps what the DOM itself holds: an iframe or a video keeps playing, focus and text selection stay, and CSS animations and transitions continue. Elsewhere the nodes are re-inserted, so component state is kept but an iframe reloads.

- The content is created the first time it is rendered and lives as long as the component that called `reparentable()`, not as long as the place showing it. `player.dispose()` destroys it earlier.
- While it is shown nowhere it stays alive, with its `update` callbacks still running, so it comes back as it was. Show it in one place at a time.
- Context and error boundaries are the ones around the `reparentable()` call. Its scoped styles are those of the component that renders it.
- Called outside a component (in a store module), the content lives until `dispose()`: for example a player that keeps going across route changes.

### Moving it imperatively

Code that works with elements directly, like drag and drop, a layout engine or a picture-in-picture toggle, can move the content itself:

```html Lesson.kn
<script lang="ts">
  import { reparentable } from '@inflector/keeno'
  import Video from './Video.kn'
  const player = reparentable(() => <Video src="/intro.mp4" />)

  function dropInto(e: DragEvent) {
    player.moveTo(e.currentTarget as Element)
  }
</script>

<aside>{player}</aside>
<div class="dropzone" onDragover={(e) => e.preventDefault()} onDrop={dropInto}></div>
<button onClick={() => player.moveTo('#pip')}>Picture in picture</button>
<button onClick={() => player.remove()}>Hide</button>
```

- `player.moveTo(target, before?)` moves the content into `target` (an element or a CSS selector), before `before` or at the end. It creates the content if it was never rendered. The move happens right away and is native where the browser supports it. The content stays there and keeps following its own updates.
- `player.remove()` takes the content out of the page. It stays alive and can be shown again as it was.
- `player.nodes()` returns its current nodes, wherever they are, for example to measure them.
- After `moveTo()` or `remove()`, a place in markup that was already showing the content does not take it back just because it updates. A place that renders it anew does, such as a branch of a condition that switches back, and from then on markup is in charge again.

For a single DOM node that isn't Keeno content, `moveNode(node, parent, before?)` does the same native-when-possible move.

For items that move between lists, such as cards on a kanban board, use `keyedReparentable()`. It creates one entry per key on first use, and every entry belongs to the component that called it, even when it is first rendered inside a list row:

```html Board.kn
<script lang="ts">
  import { keyedReparentable } from '@inflector/keeno'
  import Card from './Card.kn'
  const cards = state([{ id: 1, column: 'todo' }, { id: 2, column: 'done' }])
  const cardView = keyedReparentable((id: number) => <Card id={id} />)

  function remove(id: number) {
    cards.set(cards.filter((c) => c.id !== id))
    cardView.delete(id)
  }
</script>

{['todo', 'done'].map((column) => (
  <ul key={column}>
    {cards.filter((c) => c.column === column).map((c) => <li key={c.id}>{cardView(c.id)}</li>)}
  </ul>
))}
```

Moving a card to the other column re-creates its `<li>`, but the `<Card>` inside moves with its state. `cardView.delete(id)` destroys an entry and `cardView.keys()` lists the live ones.

## Transition

`<Transition>` animates elements as they are added and removed inside it. Elements that are being removed stay in place until their animation ends.

```html Panel.kn
<script lang="ts">
  import { Transition } from '@inflector/keeno'
  const open = state(false)
</script>

<button onClick={() => open.set(!open)}>Toggle</button>
<Transition name="fade">{open && <div class="panel">Hello</div>}</Transition>

<style>
  .fade-enter-active, .fade-leave-active { transition: opacity 200ms }
  .fade-enter-from, .fade-leave-to { opacity: 0 }
</style>
```

An entering element gets the classes `{name}-enter-from` and `{name}-enter-active` first. One frame later, `{name}-enter-from` is swapped for `{name}-enter-to`, and all three are removed when the longest transition or animation on the element ends. Leaving works the same way with `leave`. The default `name` is `keeno`.

- `appear`: also animate the elements present on first render.
- `onEnter(el, done)` / `onLeave(el, done)`: animate with JavaScript (for example the Web Animations API) instead of classes. Call `done()` when finished.
- This works for conditionals, ternaries (the old and new element animate at the same time) and keyed lists.
- A dynamic `class={…}` on an animated element replaces its class list, which drops the transition classes. Animate a wrapper element instead.

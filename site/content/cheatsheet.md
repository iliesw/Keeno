# Cheatsheet

Everything you write day to day on one page. Each section links to the full guide.

## A component

A `.kn` file holds a `<script>`, markup and a scoped `<style>`, in any order. The script runs once per instance.

```html Counter.kn
<script lang="ts">
  const count = state(0)
  const doubled = derived(() => count * 2)
</script>

<button onClick={() => count.set(count + 1)}>{count} × 2 = {doubled}</button>

<style>
  button { font-weight: 600; }
</style>
```

`state`, `derived`, `props`, `init`, `update`, `destroy` and `ref` need no import in `.kn` files. More in [Components](components.md).

## Reactivity

| Write | What it does |
|---|---|
| `const x = state(0)` | A reactive value |
| `x` | Read it (tracked). The compiler turns it into `x.get()` |
| `x.set(1)` | Write it |
| `x.peek()` | Read without tracking |
| `x.foo` | Read a field: `x.get().foo` |
| `const y = derived(() => x * 2)` | A computed, read-only value |
| `untrack(() => x)` | Read inside a tracked scope without subscribing |
| `flush()` | Apply pending updates now |

Never reassign a state (`x = 1` is a compile error), and write a new object or array rather than mutating it: `todos.set([...todos, item])`. More in [Reactivity](reactivity.md).

## State options

```ts
state(0, { history: 50 })                     // x.undo(), x.redo(), x.canUndo, x.canRedo
state([], { persist: 'todos' })               // localStorage, synced across tabs
state(1, { url: 'page' })                     // ?page=2, back and forward work
state('', { url: { param: 'q', replace: true }, debounce: 300 })
state(50, { validate: (v) => Math.min(100, Math.max(0, v)) })
state({}, { equals: deepEqual })              // structural comparison
state(0, { throttle: 100 })
```

More in [State options](state-options.md).

## Props and children

```html Card.kn
<script lang="ts">
  import type { Children } from '@inflector/keeno'
  const { title, open = false, children } = props<{ title: string; open?: boolean; children?: Children }>()
</script>

<section class={{ open }}>
  <h2>{title}</h2>
  {children}
</section>
```

- Destructured props stay reactive. Defaults apply to `undefined` and `null`.
- Use it as `<Card title="Hi" open={isOpen}><p>Body</p></Card>`. Dynamic values are passed as getters.
- No rest props: use `const p = props()` and read `p.x`.

## Templates

| Syntax | Example |
|---|---|
| Text and attributes | `<img src={user.avatar} alt={user.name} />` |
| Condition | `{count > 5 && <p>big</p>}` |
| Either / or | `{user ? <Hi /> : <Login />}` |
| Keyed list | `{todos.map((t) => <li key={t.id}>{t.text}</li>)}` |
| Event | `<button onClick={(e) => save(e)}>` |
| Two-way binding | `<input bind:value={name} />`, `<input type="checkbox" bind:checked={done} />` |
| Element ref | `const el = ref<HTMLInputElement>()` then `<input ref={el} />` |
| Classes | `class={['btn', active && 'on', { big: size > 2 }]}` |
| Spread | `<input {...attrs} />`, `<Item {...item} />` |
| Literal `>` in text | `{'>'}` or `&gt;` |

`null`, `undefined` and `false` remove an attribute. More in [Templates](templates.md).

## Lifecycle

| Helper | Runs |
|---|---|
| `init(fn)` | Once, after the DOM is inserted. A returned function runs on destroy |
| `update(fn)` | When anything `fn` reads changes, not on mount |
| `update(fn, [a, b])` | Only when `a` or `b` changes |
| `destroy(fn)` | On unmount |
| `x.onUpdate((old, next) => …)` | Synchronously on every change of `x` |

```ts
init(() => {
  const id = setInterval(() => now.set(new Date()), 1000)
  return () => clearInterval(id)
})
```

## Styles

```css
/* in <style>: scoped to this component */
button { color: teal; }
:global(body) { margin: 0; }          /* unscoped */
.card :global(a) { color: inherit; }  /* scoped .card, any <a> inside */
.btn { @apply rounded-lg px-4 py-2; }  /* Tailwind, with @tailwindcss/vite */
```

More in [Styles](styles.md).

## Context

```ts
// theme.ts
export const Theme = createContext<'light' | 'dark'>('light')

// a parent: provide a value (a state stays reactive)
provide(Theme, theme)

// any descendant
const theme = inject(Theme)
```

More in [Context](context.md).

## Built-in components

| Component | Use it for |
|---|---|
| `<ErrorBoundary fallback={(error, reset) => …}>` | Catching render errors |
| `<Await promise={p} pending={…} fulfilled={(v) => …} rejected={(e) => …} />` | Showing a promise's states |
| `lazy(() => import('./Page.kn'))` | Loading a component on demand |
| `<Dynamic component={C} {...props} />` | Rendering a component chosen at run time |
| `<Portal target="#modals">` | Rendering somewhere else in the page |
| `<Transition name="fade">` | Animating elements in and out |
| `reparentable(() => <Player />)` | Moving live content without re-creating it |

All are exported from `@inflector/keeno`. More in [Built-in components](built-ins.md).

## Routing

```ts
import { Link, Router, navigate, useRoute } from '@inflector/keeno-router'

const routes = [
  { path: '/', component: Home },
  { path: '/users/:id', component: User },
  { path: '*', component: NotFound },
]
// <Router routes={routes} />, <Link href="/users/1">Ada</Link>

const route = useRoute()   // route.params.id, route.query.get('tab'), route.path
navigate('/settings', { replace: true })
```

More in [Routing](routing.md).

## Mounting and server rendering

```ts
import { hydrate, mount } from '@inflector/keeno'
import { renderToString } from '@inflector/keeno/server'

mount(App, document.getElementById('app')!)
const html = await renderToString(App, { url })   // on the server
hydrate(App, document.getElementById('app')!)      // in the browser
```

More in [Server rendering](ssr.md).

## Tooling

| Tool | What it gives you |
|---|---|
| `@inflector/vite-plugin-keeno` | `.kn` compilation, HMR, scoped CSS, Tailwind, dev tools |
| Dev tools panel | `Alt+Shift+D` to open, `Alt+Shift+C` to pick a component |
| VS Code extension | Highlighting and TypeScript IntelliSense in `.kn` files |
| `keeno-check` | Type-check every `.kn` and `.ts` file in CI |

More in [Tooling](tooling.md).

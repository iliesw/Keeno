# Reactivity

Keeno tracks reads of states and deriveds, and re-runs exactly the code that depends on them. There is no virtual DOM and no component re-rendering.

## state

```ts
const count = state(0)
```

In a `.kn` file:

| You write | It means |
|---|---|
| `count` | Read the value (tracked) |
| `count.set(v)` | Write. Does nothing if the value is equal (`Object.is` by default) |
| `count.peek()` | Read without tracking |
| `count.get()` | Explicit tracked read |
| `count.onUpdate((old, next) => …)` | Synchronous listener for real changes |
| `count.undo()`, `count.redo()`, `count.canUndo`, `count.canRedo` | History, with the `history` option |
| `count.foo` (anything else) | `count.get().foo` |

To call a method of the value that shares a reserved name, go through `get()`: `map.get().set(k, v)`.

States are immutable by convention. Update arrays and objects with a new value:

```ts
todos.set([...todos, newTodo])
todos.set(todos.filter((t) => t.id !== id))
todos.set(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
```

Mutating in place (`todos.push(x)`) does not trigger updates.

Writes are synchronous: the value changes immediately and `onUpdate` listeners run right away. DOM updates and `update(fn)` re-runs are batched in a microtask.

Reassigning a state variable (`count = 5`) is a compile error. Use `count.set(5)`.

## derived

`derived(fn)` is a computed, read-only signal. It recomputes only when something it read changes, and it is always current, even when read synchronously right after a write.

```html Cart.kn
<script lang="ts">
  const price = state(10)
  const qty = state(2)
  const total = derived(() => price * qty)
  const expensive = derived(() => total > 100)

  function more() {
    qty.set(qty + 1)
    console.log(total) // already updated
  }
</script>

<p>{qty} × {price} = {total}</p>
{expensive && <p class="warn">That's a lot</p>}
<button onClick={more}>more</button>
```

- Use `derived` instead of copying values into other states inside `update()`. That pattern goes stale or loops; this one cannot.
- Code that reads a derived only re-runs when its value actually changes. In the example above, `{expensive && …}` re-renders only when `total` crosses 100.
- `derived(fn, { equals })` takes a custom equality function.
- A derived reads like a state, with `get`, `peek` and `onUpdate`. It has no `set`, and `bind:` on a derived is a compile error.
- A derived that depends on itself throws.

## Async derived

Give `derived` an async function and it holds the resolved value. Render it inside [`<Loading>`](built-ins.md#loading), which shows a fallback until the first value arrives:

```html User.kn
<script lang="ts">
  import { Loading, pending } from '@inflector/keeno'
  const { userId } = props<{ userId: number }>()

  const user = derived(async () => {
    const res = await fetch(`/api/users/${userId}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<{ name: string; email: string }>
  })
</script>

<Loading fallback={() => <p>Loading…</p>}>
  <h1>{user.name}</h1>
  <p>{user.email}</p>
  {pending(() => user) && <small>refreshing…</small>}
  <button onClick={() => user.refresh()}>Reload</button>
</Loading>
```

- It reads like any derived: `{user.name}` in markup, `user` in other deriveds. A derived that reads an async one waits for it too.
- When something it read changes (`userId` above), it runs again. The current value stays on screen until the new one arrives, and a result from a run that was replaced in the meantime is ignored.
- `user.refresh()` runs it again on demand, with the same keep-the-old-value behavior.
- `pending(() => user)` is true while a run is in flight, including re-runs. It is reactive.
- A rejection or a thrown error goes to the closest `<ErrorBoundary>`.
- Only the reads **before the first `await`** are tracked. Read the states you depend on at the top of the function.
- Read async values in markup or in other deriveds, not at the top of a component's `<script>`: there, a value that isn't ready yet stops the component from being created.

### Aborting requests

The function receives a `signal` that is aborted when a newer run starts or the component is destroyed. Pass it to `fetch` to cancel requests that are no longer needed:

```ts
const results = derived(async ({ signal }) => {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal })
  return res.json()
})
```

With [server rendering](ssr.md), the value the server fetched is sent to the browser and reused, and a `fetch` given `signal` is skipped during hydration.

## update vs onUpdate vs derived

| Need | Use |
|---|---|
| A value computed from other values | `derived` |
| A side effect (DOM, storage, network) when values change | `update(fn)` or `update(fn, [deps])` |
| React synchronously to each change of one state, with the old value | `x.onUpdate` |

## Shared stores in plain .ts files

Outside `.kn` files, states are plain objects, so you call `.get()` and `.set()` yourself:

```ts
// store.ts
import { derived, state } from '@inflector/keeno'

export const user = state<{ name: string } | null>(null, { persist: 'user' })
export const isLoggedIn = derived(() => user.get() !== null)
```

Only states and deriveds declared in the `.kn` file itself are unwrapped. An imported state is used as `user.get()` and `user.set(…)` in components too.

## store

`store(obj)` is a deep reactive object for nested data. Read and change it like a plain object: assignments, `push`, `splice`, `delete`. Only the code that read a changed property re-runs.

```html Todos.kn
<script lang="ts">
  const todos = store({
    draft: '',
    items: [] as { id: number; title: string; done: boolean }[],
  })
  const left = derived(() => todos.items.filter((t) => !t.done).length)

  function add() {
    todos.items.push({ id: Date.now(), title: todos.draft, done: false })
    todos.draft = ''
  }
</script>

<input bind:value={todos.draft} />
<button onClick={add}>Add</button>
<ul>
  {todos.items.map((t) => (
    <li key={t.id}>
      <input type="checkbox" bind:checked={t.done} />
      {t.title}
    </li>
  ))}
</ul>
<p>{left} left</p>
```

- Checking one todo re-runs only what reads that todo's `done` (its checkbox and `left`). The list and the other rows stay as they are.
- A store isn't unwrapped like a state: you use it directly, in `.kn` and `.ts` files alike. It works the same when imported from a shared module.
- `bind:value` and `bind:checked` work on store properties, such as `bind:value={form.user.email}`.
- Plain objects and arrays inside a store are reactive too. Other values (Dates, Maps, Sets, class instances) are stored as they are: replace them to trigger updates.
- Changes made in the same tick are batched, like state writes.
- `snapshot(todos)` returns a plain deep copy, for `JSON.stringify`, logging or sending to a server. Used in a derived or in markup, it re-runs on any change inside the store.
- `reconcile(todos.items, fresh)` updates a store to match new data while changing only what differs. Array items with the same `id` (or another `key` option) are kept and updated in place. Use it to apply fresh server data without re-rendering rows that didn't change.

Use `state` for single values and data you replace as a whole, and `store` for nested data that you change in place.

## Batching and flush

All work runs in one microtask, in this order: stale deriveds, DOM updates, mount jobs (`init` and the first `update` runs), then `update` re-runs. `flush()` from `@inflector/keeno` runs pending work synchronously, which is handy in tests.

See [State options](state-options.md) for persistence, URL sync, undo/redo, validation and debouncing.

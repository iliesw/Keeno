# Reactivity

Lux tracks reads of states and deriveds, and re-runs exactly the code that depends on them. There is no virtual DOM and no component re-rendering.

## state

```ts
const count = state(0)
```

In a `.lx` file:

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

```html Cart.lx
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

## update vs onUpdate vs derived

| Need | Use |
|---|---|
| A value computed from other values | `derived` |
| A side effect (DOM, storage, network) when values change | `update(fn)` or `update(fn, [deps])` |
| React synchronously to each change of one state, with the old value | `x.onUpdate` |

## Shared stores in plain .ts files

Outside `.lx` files, states are plain objects, so you call `.get()` and `.set()` yourself:

```ts
// store.ts
import { derived, state } from 'lux'

export const user = state<{ name: string } | null>(null, { persist: 'user' })
export const isLoggedIn = derived(() => user.get() !== null)
```

Only states and deriveds declared in the `.lx` file itself are unwrapped. An imported store is used as `user.get()` and `user.set(…)` in components too.

## Batching and flush

All work runs in one microtask, in this order: stale deriveds, DOM updates, mount jobs (`init` and the first `update` runs), then `update` re-runs. `flush()` from `lux` runs pending work synchronously, which is handy in tests.

See [State options](state-options.md) for persistence, URL sync, undo/redo, validation and debouncing.

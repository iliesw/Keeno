# State options

`state(value, options)` accepts these options. They combine freely, except `debounce` with `throttle`.

| Option | Type | What it does |
|---|---|---|
| `equals` | `(a, b) => boolean` | Replaces `Object.is` to decide whether a write is a change. |
| `validate` | `(next, prev) => value` | Coerces or rejects writes. Return `prev` to reject. |
| `persist` | `string` | Saves to `localStorage` under this key and syncs across tabs. |
| `url` | `string` or `{ param, replace? }` | Two-way sync with a query parameter. Back and forward work. |
| `history` | `number` | Keeps this many past values for `undo()` and `redo()`. |
| `debounce` | `number` (ms) | Applies a write only after writes stop for this long. |
| `throttle` | `number` (ms) | Applies at most one write per interval: the first one now, the last one at the end. |

## equals

```ts
import { deepEqual } from '@inflector/keeno'

const filters = state({ tags: [] as string[] }, { equals: deepEqual })
filters.set({ tags: [] }) // no change, nothing re-runs
```

`deepEqual` compares primitives, arrays, plain objects and dates structurally.

## validate

`validate(next, prev)` runs on every write, and also on the initial value and on values loaded from storage or the URL. Return the value to store. Return `prev` to reject the write.

```ts
const volume = state(50, { validate: (v) => Math.min(100, Math.max(0, v)) })
const age = state(30, { validate: (v, prev) => (Number.isInteger(v) && v >= 0 ? v : prev) })
```

With `bind:value`, the input shows the stored value after a coerced or rejected write.

## persist

```ts
const todos = state<Todo[]>([], { persist: 'todos' })
```

- On creation, the saved value (JSON) replaces the initial value, after `validate`. Unreadable data is ignored.
- Every change is saved, and other tabs with a state on the same key receive it through `BroadcastChannel`.
- Values must be JSON-serializable. Writing `undefined` removes the key.

## url

```ts
const page = state(1, { url: 'page' }) // ?page=2
const q = state('', { url: { param: 'q', replace: true }, debounce: 300 })
```

- **Reading:** the initial value comes from the query parameter, parsed according to the default's type:
  - strings as-is
  - numbers with `Number` (an invalid number falls back to the default)
  - booleans from `true`, `1` or an empty value
  - anything else as JSON
- **Writing:** writes update the query. All URL states changed in the same tick produce a single history entry. When the value equals the default, the parameter is removed.
- **Back and forward:** both restore earlier values without adding entries.
- **`replace: true`:** uses `history.replaceState`, for values like a search box that shouldn't fill the history.

## history

```html Editor.kn
<script lang="ts">
  const text = state('', { history: 100 })
</script>

<textarea bind:value={text}></textarea>
<button disabled={!text.canUndo} onClick={() => text.undo()}>Undo</button>
<button disabled={!text.canRedo} onClick={() => text.redo()}>Redo</button>
```

- Each change pushes the old value, and the stack keeps the last `history` values. Because updates are immutable, this stores references and doesn't copy.
- A new write clears the redo stack.
- `canUndo` and `canRedo` are reactive.
- `undo()` and `redo()` notify like normal writes, so persistence and URL sync follow.
- Without the option, `undo()` and `redo()` do nothing.

## debounce and throttle

```ts
const search = state('', { debounce: 300 })
update(() => {
  fetchResults(search) // runs 300 ms after typing stops
})
```

- **debounce:** the value changes only when writes stop for that long.
- **throttle:** the first write applies immediately, and later writes in the window collapse into one at the end.
- **Inputs:** with `bind:value` the input keeps what the user types while a write is pending.
- **Unmount:** pending writes are dropped when the component unmounts.

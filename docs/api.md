# API reference

Everything below is exported from `lux`. In `.lx` files, `state`, `derived`, `props`, `init`, `update` and `destroy` are available without importing.

## Reactivity

```ts
state<T>(value: T, options?: StateOptions<T>): State<T>
derived<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }): Derived<T>
untrack<T>(fn: () => T): T          // run fn without tracking reads
flush(): void                       // run pending updates synchronously
deepEqual(a: unknown, b: unknown): boolean
isState(v): v is State<unknown>
isSignal(v): v is Signal<unknown>   // State or Derived
```

`State<T>` (extends `Signal<T>`):

| Member | Description |
|---|---|
| `get(): T` | Tracked read (implicit in `.lx` files) |
| `peek(): T` | Untracked read |
| `set(value: T): void` | Write; ignored if `equals(old, value)` |
| `onUpdate(fn: (old, next) => void): () => void` | Synchronous change listener; returns unsubscribe |
| `undo()`, `redo()` | History navigation (`history` option) |
| `canUndo`, `canRedo` | Reactive booleans |

`Derived<T>` (extends `Signal<T>`): `get()`, `peek()`, `onUpdate()`. Read-only.

`StateOptions<T>`:

```ts
interface StateOptions<T> {
  equals?: (a: T, b: T) => boolean
  validate?: (next: T, prev: T) => T
  persist?: string
  url?: string | { param: string; replace?: boolean }
  history?: number
  debounce?: number
  throttle?: number
}
```

## Components and lifecycle

```ts
props<P>(): P                                    // the current component's props
init(fn: () => void | (() => void)): void
update(fn: () => void | (() => void), deps?: (Signal | (() => unknown))[]): void
destroy(fn: () => void): void
mount(Component, target: Node, props?): { destroy(): void }
type Component<P = any> = (props: P) => unknown
type Children = () => unknown                    // the `children` prop: renders the nested markup
```

## .lx compile rules (summary)

| Source | Compiles to |
|---|---|
| `x` (a local `state`/`derived`) | `x.get()` |
| `x.set(…)`, `x.peek()`, `x.get()`, `x.onUpdate(…)`, `x.undo()`, `x.redo()`, `x.canUndo`, `x.canRedo` | unchanged |
| `x.foo` | `x.get().foo` |
| `update(fn, [x, y])` | deps passed as the states themselves |
| `bind:value={x}` | the state itself |
| `const { a } = props()`, then `a` | `$$props.a` (a getter) |
| `{expr}` | a tracked text node / attribute |
| `{a && <X/>}`, `{a ? <X/> : <Y/>}`, `{a \|\| <X/>}` | conditional regions that re-render only on truthiness changes |
| `{list.map(i => <li key={k}>…</li>)}` | keyed list (`mapKeyed`) |
| `onClick={fn}` | `addEventListener('click', fn)` |
| `<Comp a={x} />` | `createComponent(Comp, { get a() { return x } })` |
| `<el {...obj} />` | `spread(el, obj)` |

Compile errors:
- reassigning a state, derived or destructured prop
- `bind:` on a prop or a derived
- `export` in `<script>`
- rest props
- two `<script>` or `<style>` blocks

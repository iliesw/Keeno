# API reference

Everything below is exported from `@inflector/lux`. In `.lx` files, `state`, `derived`, `props`, `init`, `update`, `destroy` and `ref` are available without importing.

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

## Refs

```ts
ref<T extends Element = HTMLElement>(): Ref<T>
isRef(v): v is Ref<Element>
type RefTarget<T> = Ref<T> | ((el: T | null) => void) | null | undefined
```

`Ref<T>`: `current: T | null` (tracked read), `peek(): T | null` (untracked).

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
hydrate(Component, target: Element, props?): { destroy(): void }  // take over server-rendered markup
type Component<P = any> = (props: P) => unknown
type Children = () => unknown                    // the `children` prop: renders the nested markup
```

## Context

```ts
createContext<T>(defaultValue: T, name?: string): Context<T>
createContext<T>(): Context<T | undefined>
provide<T>(context: Context<T>, value: T): void   // while a component is being created; in .lx, states stay states
inject<T>(context: Context<T>): T                 // closest provided value, or the default; in .lx, reads like a state
```

See [Context](context.md).

## Built-in components

| Component | Props |
|---|---|
| `ErrorBoundary` | `fallback?: content \| (error, reset) => content`, `onError?: (error) => void`, children |
| `Await` | `promise`, `pending?: () => content`, `fulfilled?: (value) => content`, `rejected?: (error) => content` |
| `Dynamic` | `component`, plus the props passed to it |
| `Portal` | `target?: Element \| selector` (default `document.body`), children |
| `Transition` | `name?` (default `lux`), `appear?`, `onEnter?(el, done)`, `onLeave?(el, done)`, children |

```ts
lazy(load: () => Promise<{ default: Component } | Component>, options?: { pending?: () => unknown }): Component & { preload(): Promise<Component> }
```

```ts
reparentable(render: () => unknown): Reparentable
// { (): Node[]; moveTo(target: Node | selector, before?: Node | null): void; remove(): void;
//   nodes(): Node[]; dispose(): void; readonly disposed: boolean }
keyedReparentable<K>(render: (key: K) => unknown): KeyedReparentable<K>  // { (key): Reparentable; delete(key): void; keys(): K[] }
moveNode(node: Node, parent: Node, before?: Node | null): void   // native moveBefore when possible
```

See [Built-in components](built-ins.md).

## Server rendering (`@inflector/lux/server`)

```ts
renderToString(Component, props?): Promise<string>           // needs the linkedom package
renderToStringWith(document: Document, Component, props?): string
```

See [Server rendering](ssr.md).

## Router (`@inflector/lux-router`)

```ts
Router            // props: routes, base?, url?, fallback?
Link              // props: href, replace?, activeClass?, exact?, class?, children
navigate(to: string, options?: { replace?: boolean; state?: unknown; scroll?: boolean }): void
useRoute(): { path, params, query: URLSearchParams, hash, matched }
link(event: MouseEvent): void                 // onClick handler for your own <a>
href(path: string): string                    // path with the router's base
isActive(path: string, exact?: boolean): boolean
matchPath(pattern: string, path: string): Record<string, string> | null
```

See [Routing](routing.md).

## Development mode

`globalThis.__LUX_DEV__ = true` turns on development warnings (duplicate list keys, for example) and the `__LUX_DEVTOOLS__` console hook. `@inflector/vite-plugin-lux` sets it during `vite dev`. Production builds leave it off.

## .lx compile rules (summary)

| Source | Compiles to |
|---|---|
| `x` (a local `state`/`derived`) | `x.get()` |
| `x.set(…)`, `x.peek()`, `x.get()`, `x.onUpdate(…)`, `x.undo()`, `x.redo()`, `x.canUndo`, `x.canRedo` | unchanged |
| `x.foo` | `x.get().foo` |
| `update(fn, [x, y])` | deps passed as the states themselves |
| `bind:value={x}` | the state itself |
| `ref={x}` | `setRef(el, x)`: `x.current` is the element |
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

# API reference

Everything below is exported from `@inflector/keeno`. In `.kn` files, `state`, `derived`, `store`, `props`, `init`, `update`, `destroy` and `ref` are available without importing.

## Reactivity

```ts
state<T>(value: T, options?: StateOptions<T>): State<T>
derived<T>(fn: () => T, options?: { equals?: (a: T, b: T) => boolean }): Derived<T>
derived<T>(fn: (ctx: { signal: AbortSignal }) => Promise<T>, options?: { equals?; key?: string; ssr?: boolean }): Derived<T>  // async
pending(fn: () => unknown): boolean // true while an async derived read by fn is loading (reactive)
untrack<T>(fn: () => T): T          // run fn without tracking reads
flush(): void                       // run pending updates synchronously
deepEqual(a: unknown, b: unknown): boolean
isState(v): v is State<unknown>
isSignal(v): v is Signal<unknown>   // State or Derived
```

`State<T>` (extends `Signal<T>`):

| Member | Description |
|---|---|
| `get(): T` | Tracked read (implicit in `.kn` files) |
| `peek(): T` | Untracked read |
| `set(value: T): void` | Write; ignored if `equals(old, value)` |
| `onUpdate(fn: (old, next) => void): () => void` | Synchronous change listener; returns unsubscribe |
| `undo()`, `redo()` | History navigation (`history` option) |
| `canUndo`, `canRedo` | Reactive booleans |

`Derived<T>` (extends `Signal<T>`): `get()`, `peek()`, `onUpdate()`, `refresh()` (run again). Read-only. Reading an async derived before its first value throws `NotReady`, which `<Loading>` catches.

## Stores

```ts
store<T extends object>(value: T): T              // deep reactive proxy; mutate it directly
snapshot<T>(value: T): T                          // plain deep copy (tracks the whole store when read reactively)
reconcile<T extends object>(target: T, next: T, options?: { key?: string }): void  // minimal in-place update (array items matched by `key`, default 'id')
isStore(v): boolean
```

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

## Directives

```ts
type Directive<E extends Element = HTMLElement, V = undefined> = (el: E, value: V) => void | (() => void)
```

`use:name={value}` on a DOM element: runs after insertion, re-runs (after the cleanup) when the value or the directive changes, cleans up on removal. See [Directives](directives.md).

## Context

```ts
createContext<T>(defaultValue: T, name?: string): Context<T>
createContext<T>(): Context<T | undefined>
provide<T>(context: Context<T>, value: T): void   // while a component is being created; in .kn, states stay states
inject<T>(context: Context<T>): T                 // closest provided value, or the default; in .kn, reads like a state
```

See [Context](context.md).

## Built-in components

| Component | Props |
|---|---|
| `ErrorBoundary` | `fallback?: content \| (error, reset) => content`, `onError?: (error) => void`, children |
| `Loading` | `fallback?: content \| () => content`, children |
| `Await` | `promise`, `pending?: () => content`, `fulfilled?: (value) => content`, `rejected?: (error) => content` |
| `Dynamic` | `component`, plus the props passed to it |
| `Portal` | `target?: Element \| selector` (default `document.body`), children |
| `Transition` | `name?` (default `keeno`), `appear?`, `onEnter?(el, done)`, `onLeave?(el, done)`, children |

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

## Server rendering (`@inflector/keeno/server`)

```ts
renderToString(Component, props?, { timeout? }): Promise<string>   // waits for async deriveds; needs linkedom
renderToStream(Component, props?, { timeout? }): ReadableStream<string>  // streams <Loading> boundaries
renderToStringWith(document: Document, Component, props?): string
getRequest(): Request                           // in a server function or a server render
setHeader(name: string, value: string): void    // a header on the server function's response
```

See [Server rendering](ssr.md).

## Server functions

```ts
server<F extends (...args) => Promise<any>>(fn: F): F   // runs on the server; auto-imported in .kn
ServerFunctionError                                     // what a failed call throws: message, status
```

See [Server functions](server-functions.md).

## Router (`@inflector/keeno-router`)

```ts
Router            // props: routes, base?, url?, fallback?, viewTransition?, prefetch?
Link              // props: href, replace?, transition?, prefetch?, activeClass?, exact?, class?, children
navigate(to: string, options?: { replace?: boolean; state?: unknown; scroll?: boolean; transition?: boolean }): void
useRoute(): { path, params, query: URLSearchParams, hash, matched }
link(event: MouseEvent): void                 // onClick handler for your own <a>
href(path: string): string                    // path with the router's base
isActive(path: string, exact?: boolean): boolean
matchPath(pattern: string, path: string): Record<string, string> | null
// RouteDefinition: { path, component, layouts?: Component[], errors?: Record<number, Component>, load?, staleTime? }
// load(ctx: { params, query: URLSearchParams, path, signal }): T | Promise<T>   → the page's `data` prop (PageProps<T>)
prefetch(to: string): Promise<void>           // load a page's code and data before navigating
// PrefetchMode: 'hover' | 'viewport' | 'eager' | 'none' (true = 'hover')
query<T>(key: string | unknown[], fn: (ctx: { signal }) => T | Promise<T>, options?: { staleTime?: number }): Promise<T>
invalidate(key?: string | unknown[] | ((key: unknown[]) => boolean)): void   // all keys, a prefix, or a filter
action(fn, options?: { invalidate?: boolean | QueryKey[] }): Action   // callable; .pending, .result, .error, .submit, .reset()
httpError(status: number, message?: string): HttpError   // throw it to show the status's error page
errorStatus(error: unknown): number                      // error.status, else 500
pageRoutes(files: Record<string, PageModule | LoadModule>, dir?: string): RouteDefinition[]   // from import.meta.glob
preloadRoute(routes: RouteDefinition[], url: string): Promise<void>             // before SSR / hydrate
```

`virtual:keeno-pages` (Vite plugin): `export default Pages` (`<Router>` props except `routes`), `export const routes`.

See [Routing](routing.md) and [File-based routing](file-routing.md).

## Types

Exported for annotating your own code. Each is described with the API it belongs to above.

```ts
// @inflector/keeno
type Equals<T> = (a: T, b: T) => boolean
type UpdateListener<T> = (old: T, next: T) => void             // x.onUpdate(fn)
interface DerivedOptions<T> { equals?: Equals<T>; key?: string; ssr?: boolean }  // key/ssr: async deriveds and SSR
interface AsyncContext { readonly signal: AbortSignal }         // what an async derived's function receives
interface StateOptions<T> { /* see above */ }
interface UrlOptions { param: string; replace?: boolean }      // state(v, { url: { … } })
type Dep = Signal<any> | (() => unknown)                       // update(fn, deps)
interface MountedApp { destroy(): void }                       // returned by mount() / hydrate()
type Component<P = any> = (props: P) => unknown
type Children = () => unknown
type Directive<E extends Element = HTMLElement, V = undefined> = (el: E, value: V) => void | (() => void)
interface ReconcileOptions { key?: string }                    // reconcile(target, next, options)
class NotReady { readonly derived: Derived<any> }              // thrown by reading an async derived without a value
// Props of the built-in components:
ErrorBoundaryProps, LoadingProps, AwaitProps<T>, DynamicProps<P>, PortalProps, TransitionProps
interface LazyOptions { pending?: () => unknown }               // lazy(load, options)
type LazyComponent<P> = Component<P> & { preload(): Promise<Component<P>> }
interface ComponentInfo { name: string; props: Record<string, unknown>; children: ComponentInfo[] }  // __KEENO_DEVTOOLS__.tree()

// @inflector/keeno/server
interface RenderOptions { timeout?: number }                    // renderToString / renderToStream

// @inflector/keeno-router
type Params = Record<string, string>
interface RouteProps { params: Params }                        // props of a route's component
interface LayoutProps extends RouteProps { children: Children }
interface ErrorPageProps extends RouteProps { status: number; error: unknown; reset: () => void }
interface Route { path; params; query: URLSearchParams; hash; matched: RouteDefinition | null }  // useRoute()
class HttpError extends Error { readonly status: number }      // httpError(status)
interface NavigateOptions { replace?; state?; scroll?; transition? }
RouterProps, LinkProps, RouteDefinition, PageModule

// @inflector/vite-plugin-keeno
interface KeenoPluginOptions { hmr?; tailwind?: boolean | TailwindOptions; devtools?; useFileRouter?; pages? }
interface TailwindOptions { reference?: string }
```

## Development mode

`globalThis.__KEENO_DEV__ = true` turns on development warnings (duplicate list keys, for example) and the `__KEENO_DEVTOOLS__` hook that the dev tools panel (`@inflector/keeno/devtools`, see [Tooling](tooling.md#dev-tools-panel)) is built on. `@inflector/vite-plugin-keeno` sets it during `vite dev` and loads the panel. Production builds leave it off.

## .kn compile rules (summary)

| Source | Compiles to |
|---|---|
| `x` (a local `state`/`derived`) | `x.get()` |
| `x.set(…)`, `x.peek()`, `x.get()`, `x.onUpdate(…)`, `x.undo()`, `x.redo()`, `x.canUndo`, `x.canRedo`, `x.refresh()` | unchanged |
| `x.foo` | `x.get().foo` |
| `update(fn, [x, y])` | deps passed as the states themselves |
| `bind:value={x}` | the state itself |
| `use:x={v}`, `use:x` | `use(el, () => x, () => v)`: after insertion, re-run on change |
| `bind:value={a.b.c}` | `bindPath(() => a.b, () => 'c')`: a state at that path, or a store property |
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
- `use:` on a component, a `use:` name that isn't an identifier, or a string value
- `export` in `<script>`
- rest props
- two `<script>` or `<style>` blocks

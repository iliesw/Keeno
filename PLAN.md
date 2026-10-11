# Lux: a compiled, signal-based frontend framework (`.lx` files)

## Context
You want an HTML-first, Svelte-like framework with a scoped `<style>` per component, a simple reactivity model built on `state()`, React-style template expressions, and lifecycle helpers (`init`, `update`, `destroy`, `x.onUpdate`). The project folder is empty, so this is a new build. Decisions so far:
- **Compilation:** a compiler plus a Vite plugin.
- **Updates:** fine-grained signals, with no virtual DOM.
- **Templates:** JSX-style.
- **Props:** `props()` with callback props.
- **Language:** TypeScript is supported.

## What a component looks like
```html
<!-- Counter.lx -->
<script lang="ts">
  import Item from './Item.lx'
  const { title, onSave } = props()
  const count = state(0)
  const todos = state<{ id: number; text: string }[]>([])
  const name  = state('')

  init(() => console.log('mounted'))
  destroy(() => console.log('bye'))
  update(() => localStorage.setItem('n', String(count)))        // auto-tracked
  update(() => console.log('name or count changed'), [name, count]) // explicit deps
  count.onUpdate((old, next) => console.log(old, '->', next))

  function add() {
    todos.set([...todos, { id: Date.now(), text: name }])
    name.set('')
  }
</script>

<h1>{title}: {count}</h1>
<button onClick={() => count.set(count + 1)}>+1</button>
<input bind:value={name} />
{count > 5 && <p class="warn">big!</p>}
<ul>{todos.map(t => <Item key={t.id} text={t.text} />)}</ul>
<button onClick={() => onSave(count)}>save</button>

<style>
  h1 { color: teal }          /* scoped to this component */
  :global(body) { margin: 0 } /* escape hatch */
</style>
```

## Semantics (the spec)
| API | Behavior |
|---|---|
| `state(v)` | Creates a signal. In `.lx` files, a bare `x` reads the value and is tracked. `x.set(v)` writes it, and nothing happens if `Object.is(old, v)`. Writes are synchronous, and DOM updates are batched in a microtask. |
| reserved members | `x.set`, `x.onUpdate`, `x.get`, `x.peek` (an untracked read). Any other `x.foo` compiles to `x.get().foo`. To call a method of the value that shares one of these names, use `x.get().set(...)`. |
| `x.onUpdate((old,new)=>…)` | Runs synchronously on every real change. It is removed automatically when the component is destroyed, and it also returns an unsubscribe function. |
| `init(fn)` | Runs once after the component's DOM is inserted. If `fn` returns a function, that function runs on destroy. |
| `update(fn)` | Auto-tracked: runs once after mount, then again whenever any state read inside it changes. |
| `update(fn, [a,b])` | Explicit dependencies: runs **only when** `a` or `b` changes, not on mount. The array holds the signals themselves, so the compiler does not rewrite the identifiers inside it. A returned function is used as cleanup before the next run. |
| `destroy(fn)` | Runs when the component unmounts. |
| `props()` | Destructured props stay reactive, because the compiler rewrites `title` to `$$props.title`, which is a getter. Callbacks are ordinary props. Nested content arrives as `children`. |
| Templates | `{expr}` is a reactive text node or attribute. `{cond && <X/>}` and `{cond ? <A/> : <B/>}` render conditionally. For `{arr.map(i => <X key={…}/>)}`, the compiler detects the `.map` pattern and generates keyed reconciliation. Events use `onClick={fn}`. `bind:value` and `bind:checked` give two-way binding to a state. |
| Scoped CSS | Each component gets a hash class (`lux-<hash(filePath)>`). Every element in its template gets that class, and every compound selector gets `.lux-xxx`. `:global(...)` is left as written. |
| Plain `.js`/`.ts` | `state()` is a normal object there, so you use `.get()` and `.set()`. Only states declared locally in a `.lx` file get automatic unwrapping. Shared stores work this way. |

Arrays and objects are immutable by convention: you update them with `.set([...arr, x])`. Deep proxies are not part of v1.

## Tooling
- **Bun** (1.4) is the package manager, workspace tool, script runner and test runner (`bun test`, with happy-dom registered through a test preload).
- Vite still handles the dev server and builds, launched with `bunx --bun vite`.
- Every script must work on Windows: no `||`, `&&` chains, `rm -rf` or inline `VAR=x` env prefixes in `package.json` scripts. Use Bun/Node APIs (for example `bun run scripts/clean.ts`) for anything more complex than a single command.

## Repo layout (Bun workspaces, TypeScript)
```
packages/
  lux/                       runtime (published as "lux")
    src/signal.ts            State class, tracking context, batch/microtask scheduler
    src/lifecycle.ts         owner tree; init / update / destroy / onUpdate disposal
    src/dom.ts               template(), insert(), mapKeyed(), attr(), on(), bind()
    src/component.ts         createComponent(), props proxy, mount(Component, target)
    src/index.ts             public exports + types: State<T>, state<T>()
  compiler/                  "@lux/compiler"
    src/split.ts             .lx → { script, lang, markup, style }
    src/script.ts            Babel parse (ts+jsx); rewrite state reads, props destructuring, update deps
    src/template.ts          markup wrapped in <>…</>, parsed as JSX → DOM codegen
    src/style.ts             postcss + postcss-selector-parser scoping, :global
    src/index.ts             compile(source, { filename }) → { js, css, map }
  vite-plugin-lux/           .lx transform, virtual CSS module (Foo.lx?lux&type=style.css), HMR
examples/counter, examples/todo
```

## Compiler pipeline
1. **split.ts**: extracts `<script lang?>`, `<style>`, and the rest as markup. This uses a simple top-level tag scan, because the markup itself is parsed as JSX.
2. **script.ts**: parses with `@babel/parser` using the `typescript` and `jsx` plugins, then uses scope analysis from `@babel/traverse`:
   - Records each `const x = state(...)` binding.
   - Rewrites a reference to `x.get()` unless it is the object of `.set`, `.onUpdate`, `.get` or `.peek`, sits inside the deps array of `update`, or is a `bind:` target.
   - Reports a compile error if a state is reassigned.
   - Rewrites `const {a,b} = props()` so that later references read `$$props.a`.
   - Auto-injects the imports `state`, `props`, `init`, `update` and `destroy` from `lux`.
3. **template.ts**: parses `<>{markup}</>` with Babel JSX, and the same state rewrite runs inside expressions.
   - Static HTML subtrees are hoisted into one `template('<h1 class="lux-ab12"> <!></h1>')` per component and cloned on each instance, the way Solid does it.
   - Dynamic parts become `insert(parent, () => expr, marker)` or `attr(el, 'class', () => expr)`, each wrapped in a tracked effect.
   - `insert` handles strings, numbers, nodes, arrays, `null`/`false`, and nested functions, so `&&` and ternaries work without special syntax.
   - The pattern `X.map((item, i) => <… key={k}>)` becomes `mapKeyed(() => X, item => k, (item, i) => node)`.
   - A capitalized tag becomes `createComponent(Item, { get text() { return … }, onSave: fn, children: () => … })`.
   - `on*` attributes become `on(el, 'click', fn)`.
4. **style.ts**: adds the scope class to every selector and unwraps `:global()`. The CSS is returned separately, and Vite injects or extracts it.
5. **TypeScript**: the output keeps the TS types. The Vite plugin then runs `transformWithEsbuild` to strip them. Full type-checking of `.lx` files, like `svelte-check`, is a later milestone. The editor sees `State<T>` from the runtime's `.d.ts`.

## Build order
1. Runtime signals, scheduler and lifecycle, with unit tests.
2. Runtime DOM helpers (`insert`, `mapKeyed`, `bind`), tested in happy-dom.
3. Compiler: split, then script rewrite, then template codegen, then style scoping, each with snapshot tests.
4. Vite plugin and the counter and todo examples.
5. HMR: re-mount the component while keeping parent state.

## Verification
- `bun test` runs the tests across packages. The runtime tests cover tracking, batching, `onUpdate(old,new)`, `update` with and without deps, and the disposal order of `init`/`destroy`. The compiler snapshot tests cover each rewrite rule and scoped selectors, including `:global`.
- `bun run --cwd examples/todo dev` should show the following in the browser pane:
  - Adding and removing todos updates only the affected `<li>`, which we can check with a MutationObserver count.
  - The `bind:value` input works in both directions.
  - Styles do not leak between the two components.
  - `init` and `destroy` log as expected when the list is toggled.

## Later (not v1)
- `derived()`
- Deep reactive objects
- SSR and hydration
- A language server or `lux-check` for type-checking `.lx` files
- Transitions

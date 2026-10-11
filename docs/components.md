# Components

A `.lx` file is one component. It has up to three parts, in any order:

- `<script>` or `<script lang="ts">`: runs once per component instance.
- Markup: everything outside `<script>` and `<style>`, parsed as JSX.
- `<style>`: CSS scoped to this component. See [Styles](styles.md).

Imports and TypeScript `type`/`interface` declarations in the script stay at module level. Everything else runs per instance. `export` is not allowed in the script.

## Props

Call `props()` and destructure it. Destructured props stay reactive, because the compiler rewrites `title` to a getter read (`$$props.title`).

```html Greeting.lx
<script lang="ts">
  const { name, greeting = 'Hello', onClose } = props<{ name: string; greeting?: string; onClose: () => void }>()
</script>

<p>{greeting}, {name}! <button onClick={() => onClose()}>×</button></p>
```

- Defaults use `??`: `greeting = 'Hello'` applies when the prop is `undefined` or `null`.
- Renames work: `const { 'aria-label': label } = props()`.
- Rest destructuring (`...rest`) is not supported. Use `const p = props()` and read `p.x` instead.
- Callbacks are ordinary props.
- Never reassign a destructured prop: that is a compile error.
- The type argument also types the component for its parents: the editor and `lux-check` report a missing required prop or a prop of the wrong type where the component is used, and complete prop names. Without a type argument, props are `any`.

Pass props like JSX. Dynamic values become getters, so the child sees updates:

```html Parent.lx
<script lang="ts">
  import Greeting from './Greeting.lx'
  const who = state('Ada')
</script>

<Greeting name={who} onClose={() => who.set('nobody')} />
```

Spread props work on components: `<Item {...item} selected={isSelected} />`. Later props win.

## Children

Nested content arrives as the `children` prop, a function that renders it. Type it as `Children` and put `{children}` where it should appear:

```html Card.lx
<script lang="ts">
  import type { Children } from 'lux'
  const { title, children } = props<{ title: string; children?: Children }>()
</script>

<section>
  <h2>{title}</h2>
  {children}
</section>
```

```html UsesCard.lx
<script lang="ts">
  import Card from './Card.lx'
</script>

<Card title="Hi"><p>Card body</p></Card>
```

The parent writes `children` as nested markup, any number of nodes. Declare it as `children: Children` (not optional) to make content required.

## Lifecycle

| Helper | When it runs |
|---|---|
| `init(fn)` | Once, after the component's DOM is inserted. If `fn` returns a function, that runs on destroy. |
| `update(fn)` | After mount, then whenever a state or derived read inside `fn` changes. A returned function is cleanup before the next run and on destroy. |
| `update(fn, [a, b])` | Only when `a` or `b` changes, not on mount. The array holds the states themselves. A returned function is cleanup. |
| `destroy(fn)` | When the component unmounts. |
| `x.onUpdate((old, next) => …)` | Synchronously on every real change of `x`. Removed automatically on destroy; also returns an unsubscribe function. |

Order:
- Children mount before their parents.
- Within a component, `init` and `update` run in declaration order.
- On unmount, children are destroyed before parents, and callbacks run in registration order.

```html Clock.lx
<script lang="ts">
  const now = state(new Date())
  init(() => {
    const id = setInterval(() => now.set(new Date()), 1000)
    return () => clearInterval(id)
  })
  update(() => {
    document.title = now.toLocaleTimeString()
  })
</script>

<time>{now.toLocaleTimeString()}</time>
```

## Mounting

`mount(Component, target, props?)` renders at the end of `target`, runs the `init` and `update` jobs, and returns `{ destroy() }`.

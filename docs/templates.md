# Templates

Markup is JSX, written HTML-first: use `class` and `for` (`className` and `htmlFor` also work). JSX whitespace rules apply. Write `{'>'}` or `&gt;` for a literal `>` in text. HTML comments `<!-- -->` are allowed in markup.

## Expressions

`{expr}` is a live text node or attribute. It updates when the states it reads change, and nothing else is touched.

```html Profile.lx
<script lang="ts">
  const user = state({ name: 'Ada', avatar: '/ada.png' })
</script>

<img src={user.avatar} alt={user.name} />
<p title={`User ${user.name}`}>{user.name}</p>
```

Attribute values: `null`, `undefined` and `false` remove the attribute, and `true` sets it empty. `value`, `checked` and `selected` are set as DOM properties.

## Conditionals

```html Status.lx
<script lang="ts">
  const count = state(0)
  const user = state<{ name: string } | null>(null)
</script>

{count > 5 && <p class="warn">big!</p>}
{user ? <p>Hi {user.name}</p> : <button>Log in</button>}
{user || <i>anonymous</i>}
```

- **Re-rendering:** a branch is created or destroyed only when its condition changes truthiness. `{count > 5 && <p/>}` keeps the same `<p>` while `count` goes from 6 to 7.
- **Falsy numbers:** as in JS, `{0 && <X/>}` renders `0`.

## Lists

```html List.lx
<script lang="ts">
  const todos = state([{ id: 1, text: 'Write docs', done: false }])
</script>

<ul>
  {todos.map((t, i) => (
    <li key={t.id} class={{ done: t.done }}>{i + 1}. {t.text}</li>
  ))}
</ul>
```

- **Keyed reconciliation:** `X.map(item => <el key={…}>)` compiles to keyed reconciliation. Adding, removing or reordering items touches only the affected rows.
- **Item changes:** when an item changes but keeps its key, its row updates in place, and its DOM, focus and child state survive.
- **Callback shape:** the callback must be an arrow or function whose body is JSX, or a block that only returns JSX. The parameter can be an identifier or a simple destructuring (`({ id, text }) => …`).
- **Missing key:** without `key`, the item itself is the key.
- **Other `.map` calls:** a `.map` that doesn't return JSX is a normal JS expression.

## Events

`onClick={fn}`, `onInput={fn}`, `onKeyDown={fn}` and so on: the name is lowercased after `on`, so `onDblClick` listens to `dblclick`. Handlers receive the DOM event.

```html Form.lx
<script lang="ts">
  const sent = state(false)
</script>

<form onSubmit={(e) => { e.preventDefault(); sent.set(true) }}>
  <button>Send</button>
</form>
```

## Two-way binding

`bind:value={myState}` (inputs, textareas, selects) and `bind:checked={myState}` (checkboxes) take the state itself:

```html Settings.lx
<script lang="ts">
  const name = state('')
  const volume = state(5)
  const dark = state(false)
</script>

<input bind:value={name} />
<input type="number" bind:value={volume} />
<input type="checkbox" bind:checked={dark} />
<p>{name} {volume} {dark ? 'dark' : 'light'}</p>
```

Number and range inputs store numbers. Binding a prop or a derived is a compile error.

## class

`class` accepts a string, an array (falsy entries skipped, nested arrays allowed) or an object of `name: condition`:

```html Button.lx
<script lang="ts">
  const active = state(false)
  const size = state('big')
</script>

<button class={['btn', active && 'on', { [size]: true }]} onClick={() => active.set(!active)}>Toggle</button>
```

The component's scope class is always kept.

## Spread

Spread works on components and on DOM elements. Attributes apply in order, and later ones win:

```html Field.lx
<script lang="ts">
  const attrs = state({ placeholder: 'Email', type: 'email', required: true })
  const touched = state(false)
</script>

<input {...attrs} class={['field', touched && 'touched']} onBlur={() => touched.set(true)} />
```

Spread objects can include `class`, `onX` event handlers and any attribute. When the spread value changes, removed keys are cleared and changed handlers are swapped.

## SVG

Inline `<svg>` works as in HTML. Conditionals, lists and components inside it render SVG elements:

```html Dot.lx
<script lang="ts">
  const { x, y } = props()
</script>

<circle cx={x} cy={y} r="4" />
```

```html Chart.lx
<script lang="ts">
  import Dot from './Dot.lx'
  const points = state([{ id: 1, x: 10, y: 20 }])
  const grid = state(true)
</script>

<svg viewBox="0 0 100 100">
  {grid && <line x1="0" y1="90" x2="100" y2="90" />}
  <g>{points.map((p) => <Dot key={p.id} x={p.x} y={p.y} />)}</g>
</svg>
```

- **SVG roots:** a component or branch whose root is an SVG-only element (`<circle>`, `<g>`, `<path>`, `<text>`, …) is created in the SVG namespace.
- **Shared tag names:** `<a>`, `<title>`, `<style>` and `<script>` exist in both HTML and SVG. Inside `<svg>` in the same file they are SVG. As the root of a separate component they are HTML, so wrap them in a `<g>`.
- **`<foreignObject>`:** its content is HTML again.

## Tables

Write tables with their full structure. Rows go in `<tbody>`, `<thead>` or `<tfoot>`, and cells go in `<tr>`:

```html Stock.lx
<script lang="ts">
  const items = state([{ id: 1, name: 'apples', qty: 3 }])
</script>

<table>
  <thead>
    <tr><th>Name</th><th>Qty</th></tr>
  </thead>
  <tbody>
    {items.map((i) => (
      <tr key={i.id}><td>{i.name}</td><td>{i.qty}</td></tr>
    ))}
  </tbody>
</table>
```

- **Compile errors:** HTML parsers rewrite misplaced table content. `<table><tr>` gets an implied `<tbody>`, and text or a `<div>` inside a `<tr>` is moved out of the table. Lux reports these as compile errors instead of rendering a different tree, for example: `<tr> cannot be a direct child of <table>: the HTML parser would insert a <tbody> and break the template. Wrap it in <tbody> (or <thead>/<tfoot>).`
- **Allowed children:** `<table>` takes `<caption>`, `<colgroup>`, `<thead>`, `<tbody>` and `<tfoot>`. `<thead>`, `<tbody>` and `<tfoot>` take `<tr>`. `<tr>` takes `<td>` and `<th>`. `<colgroup>` takes `<col>`. `{expressions}`, components, whitespace, `<template>`, `<script>` and `<style>` are allowed anywhere.
- **Row components:** a component can have `<tr>` or `<td>` as its root.

## Components

A capitalized tag is a component: `<Item text={t.text} onSave={save} />`. Dynamic props are passed as getters, so the child stays in sync. See [Components](components.md).

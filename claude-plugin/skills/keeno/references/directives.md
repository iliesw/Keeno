# Directives

A directive is a reusable DOM behavior: a tooltip, closing a menu on an outside click, growing a textarea, watching when an element scrolls into view. You write it once as a plain function, then put it on any element with `use:name={value}`.

```html Inbox.kn
<script lang="ts">
  import { tooltip } from './directives'
  const unread = state(3)
</script>

<button use:tooltip={`${unread} unread messages`} onClick={() => unread.set(unread + 1)}>
  Inbox ({unread})
</button>
```

## Writing a directive

A directive receives the element and the value, and can return a cleanup function:

```ts
// directives.ts
import type { Directive } from '@inflector/keeno'

export const tooltip: Directive<HTMLElement, string> = (el, text) => {
  const tip = document.createElement('div')
  tip.className = 'tooltip'
  tip.textContent = text
  const show = () => {
    const r = el.getBoundingClientRect()
    tip.style.left = `${r.left + r.width / 2}px`
    tip.style.top = `${r.top - 6}px`
    document.body.append(tip)
  }
  const hide = () => tip.remove()
  el.addEventListener('pointerenter', show)
  el.addEventListener('pointerleave', hide)
  return () => {
    hide()
    el.removeEventListener('pointerenter', show)
    el.removeEventListener('pointerleave', hide)
  }
}
```

- `Directive<ElementType, ValueType>` types both arguments. Both are optional: `Directive` alone is `(el: HTMLElement) => …`.
- The directive runs once the element is in the document, like `init`, so it can measure the element, focus it or attach observers.
- The cleanup runs when the element is removed: its component is destroyed, its `{cond && …}` turns false, or its list row goes away.

## Using directives

```html Note.kn
<script lang="ts">
  import { autofocus, autosize, clickOutside } from './directives'
  const open = state(false)
  const note = state('')
</script>

<button onClick={() => open.set(true)}>Write a note</button>
{open && (
  <div class="popover" use:clickOutside={() => open.set(false)}>
    <textarea use:autofocus use:autosize bind:value={note}></textarea>
  </div>
)}
```

- `use:name` refers to `name` in scope: an import, a function declared in the `<script>`, a prop or a state holding a function.
- Without a value (`use:autosize`), the directive receives `undefined`.
- An element can have several directives. They run in the order they're written.
- Directives work on DOM elements only; on a component they're a compile error. The name must be a JavaScript identifier (`use:clickOutside`, not `use:click-outside`), and the value an expression (`use:tooltip={'Save'}`, not `use:tooltip="Save"`).

## Reactive values

The value is tracked like any expression in markup. When a state it reads changes, the cleanup runs and the directive runs again with the new value. Above, the tooltip follows `unread`.

- Reads **inside** the directive aren't tracked: only the value expression (and the directive itself, when it's a prop or a state) re-runs it.
- For a value that changes often, a directive can accept a getter instead, so it isn't set up again each time: `use:tooltip={() => `${unread} unread`}` passes a function that never changes, and the directive calls it when the tooltip opens.
- A value that reads an [async derived](reactivity.md#async-derived) waits inside `<Loading>` like the rest of the markup.

## More examples

**Click outside**, to close menus and popovers:

```ts
export const clickOutside: Directive<HTMLElement, () => void> = (el, onOutside) => {
  const handler = (e: PointerEvent) => !el.contains(e.target as Node) && onOutside()
  document.addEventListener('pointerdown', handler, true)
  return () => document.removeEventListener('pointerdown', handler, true)
}
```

**Autosize and autofocus:**

```ts
export const autosize: Directive<HTMLTextAreaElement> = (el) => {
  const fit = () => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  fit()
  el.addEventListener('input', fit)
  return () => el.removeEventListener('input', fit)
}

export const autofocus: Directive = (el) => el.focus()
```

**In view**, for infinite scroll, lazy images and scroll animations:

```ts
export const inView: Directive<Element, (visible: boolean) => void> = (el, onChange) => {
  const io = new IntersectionObserver(([entry]) => onChange(entry!.isIntersecting), { rootMargin: '200px' })
  io.observe(el)
  return () => io.disconnect()
}
```

```html Feed.kn
<ul>{posts.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
<div use:inView={(visible) => visible && loadMore()}>Loading…</div>
```

**Long press:**

```ts
export const longpress: Directive<HTMLElement, () => void> = (el, onPress) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const down = () => (timer = setTimeout(onPress, 500))
  const up = () => clearTimeout(timer)
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointerleave', up)
  return () => {
    up()
    el.removeEventListener('pointerdown', down)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointerleave', up)
  }
}
```

**A local directive** that reads the component's states:

```html Card.kn
<script lang="ts">
  const accent = state('#f97316')
  const outline = (el: HTMLElement, on: boolean) => {
    if (!on) return
    el.style.outline = `2px solid ${accent.peek()}`
    return () => (el.style.outline = '')
  }
  const selected = state(false)
</script>

<section use:outline={selected} onClick={() => selected.set(!selected)}>…</section>
```

## Directives vs. ref and init

A [ref](templates.md#element-refs) plus `init` does the same job for one element in one component:

```html
<script lang="ts">
  const input = ref<HTMLInputElement>()
  init(() => input.current?.focus())
</script>

<input ref={input} />
```

Use a directive when the behavior is reused. It works on any element in any component, several of them combine on one element, its value is reactive, and it cleans up after itself, with no ref or lifecycle code in the components that use it.

## Type checking

In the editor and in `keeno-check`, each `use:` is checked against the directive:

- **The value** must match the directive's value type. `use:tooltip={{ txt: 'Save' }}` is an error when `tooltip` expects `{ text: string }`.
- **The element** must match its element type. `use:autosize` on an `<input>` is an error because `autosize` expects a `<textarea>`. A directive typed for `HTMLElement` (the default) works on any element.
- **A required value** can't be left out: `use:tooltip` alone is an error when `tooltip` needs a value.

Go to definition and hover work on the directive's name.

## Server rendering

Directives don't run during [server rendering](ssr.md), because they need a live DOM. They run when the page hydrates in the browser.

## Errors

An error thrown by a directive, or while it re-runs, goes to the closest [`<ErrorBoundary>`](built-ins.md#errorboundary). Using something that isn't a function (`use:tooltip` where `tooltip` is a string) throws `use:tooltip needs a function`.

## Publishing directives

A directive is a plain function, so a package can export it with no component wrapper and no setup:

```ts
// @acme/tooltip
import type { Directive } from '@inflector/keeno'

export interface TooltipOptions {
  text: string
  placement?: 'top' | 'bottom'
}

export const tooltip: Directive<HTMLElement, TooltipOptions> = (el, options) => {
  // …
}
```

Users import it and write `use:tooltip={{ text: 'Save' }}` on their own markup, combined with any other directives. Keep setup cheap, since a value change runs it again, and always return a cleanup that removes every listener, observer and node the directive added.

# Styles

The `<style>` block of a component is scoped to it.

- **Scope class:** each component gets a class `lux-<hash of the file path>`. Every element in its markup gets that class, and every compound selector in its CSS gets it too: `h1 { … }` becomes `h1.lux-1a2b3c4d { … }`, and `ul > li.done` becomes `ul.lux-… > li.done.lux-…`.
- **Escape hatch:** `:global(...)` is left as written: `:global(body) { margin: 0 }` and `:global(.dark) h1 { … }`.
- **Pseudo-classes and pseudo-elements:** the scope class goes before them (`a:hover` becomes `a.lux-…:hover`).
- **At-rules:** `@media` rules are scoped. `@keyframes` steps are not.

```html Panel.lx
<div class="panel"><h2>Title</h2></div>

<style>
  .panel { padding: 1rem }
  h2 { color: teal }              /* only this component's h2 */
  :global(body) { margin: 0 }     /* global */
</style>
```

Styles don't leak between components, and parent styles don't reach into children. Dynamic `class` values keep the scope class.

The CSS is served as a virtual module (`Foo.lx?lux&type=style.css`). Vite injects it in dev with hot updates and extracts it in builds.

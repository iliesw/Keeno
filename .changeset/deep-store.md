---
"@inflector/keeno": minor
"@inflector/keeno-compiler": minor
"@inflector/keeno-language-server": minor
---

`store()`: a deep reactive object you update by plain mutation (`todos.items.push(…)`, `todo.done = true`), tracked per property. Includes `snapshot()`, `reconcile()` and `isStore()`, works with keyed lists, and `bind:value` / `bind:checked` accept store properties (`bind:value={form.user.email}`). `store` is available in `.kn` files without importing.

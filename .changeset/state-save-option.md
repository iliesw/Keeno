---
"@inflector/keeno": minor
---

Add the `save` state option for optimistic updates: writes apply at once, are sent with `save(next, prev, { signal })`, roll back if it rejects, and report through `pending()`.

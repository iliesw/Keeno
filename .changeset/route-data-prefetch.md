---
"@inflector/keeno-router": minor
"@inflector/vite-plugin-keeno": minor
---

Route data and prefetching. A route's `load` function (or a `[id].load.ts` file next to a file route) loads the page's data, passed to it as `data`, in parallel with its code. Server rendering waits for it and hydration reuses it. `query()` is a keyed cache that async deriveds re-run from on `invalidate()`, and `action()` wraps a mutation with reactive `pending`, `result` and `error`, then invalidates the cache so the data on screen loads again. `<Link prefetch="hover" | "viewport" | "eager">` (or `<Router prefetch>` for every link) and `prefetch(url)` load a page's code and data before the click.

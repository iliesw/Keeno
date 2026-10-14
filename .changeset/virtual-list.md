---
"@inflector/keeno": minor
---

Add `<Virtual>`, a built-in list that only renders the rows in view: `<Virtual each={rows} itemHeight={24}>{(row, i) => <Row row={row} />}</Virtual>`. Fixed or per-item heights, keyed rows that survive scrolling, store arrays, `scrollTo(index)` through `ref`, and server rendering of the first screen. In `.kn` files, a component whose children are a render function now types that function's parameters.

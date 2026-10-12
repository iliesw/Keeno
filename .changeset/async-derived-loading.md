---
"@inflector/keeno": minor
"@inflector/keeno-compiler": minor
---

Async `derived`: give `derived` an async function and read the value inside the new `<Loading fallback>` boundary. Re-runs keep the current value until the new one arrives (`pending(() => x)` tells you one is in flight), superseded runs are ignored and aborted through the optional `{ signal }` argument, `x.refresh()` runs it again, and rejections go to the closest `<ErrorBoundary>`.

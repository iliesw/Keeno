---
"@inflector/keeno": minor
---

Server rendering waits for async deriveds: `renderToString` returns their values in the HTML (with a `timeout` option) and sends them to the client, where `hydrate` reuses them instead of fetching again. New `renderToStream` sends the page right away with `<Loading>` fallbacks and streams each boundary's content as it becomes ready. Concurrent server renders no longer share the portal outlet, and `init`/`update` mount jobs are never queued on the server.

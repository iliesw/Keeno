---
"@inflector/keeno": minor
"@inflector/keeno-compiler": minor
"@inflector/vite-plugin-keeno": minor
"@inflector/keeno-language-server": patch
---

Server functions. Wrap an async function in `server(…)` and it runs on the server: call it like any function, and in the browser the call becomes a typed request (`POST /_keeno/fn/<id>`). It is auto-imported in `.kn` files and imported from `@inflector/keeno` in `.ts` files. The compiler leaves the function, and the imports only it used, out of the browser bundle, and reports a server function that uses a component's variables. Arguments and results keep `Date`, `Map`, `Set`, `BigInt` and `undefined`, a `FormData` is sent as a form, and errors arrive as `ServerFunctionError` with their status. `getRequest()` and `setHeader()` from `@inflector/keeno/server` give access to the request and response. Apps with server functions build `dist/client` and `dist/server` with every render strategy, and `createHandler()` serves them, including `spa`, `ssg` and `islands` builds.

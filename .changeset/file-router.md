---
'@inflector/keeno-router': minor
'@inflector/vite-plugin-keeno': minor
---

File-based routing. `keeno({ useFileRouter: true, pages: './src/pages' })` (the defaults) provides `virtual:keeno-pages`, whose `<Pages>` component renders the page for the URL: `index.kn` is `/`, `about.kn` is `/about`, `[id].kn` is `/:id`, `_layout.kn` wraps its directory, `_all.kn` catches the rest of its directory, `_404.kn` renders for paths that match nothing, and `_500.kn`, `_403.kn`… for errors a page throws (`throw httpError(403)`).

`<Router>` routes gain `layouts` (kept across navigation while shared) and `errors` (error pages by status), and the router exports `pageRoutes()`, `preloadRoute()`, `httpError()`, `HttpError` and `errorStatus()`.

The Vite plugin now depends on `@inflector/keeno-router` and resolves `@inflector/keeno-router` imports itself when the app hasn't installed it, so routing needs no extra install. `examples/todo` uses file routes (`src/pages`).

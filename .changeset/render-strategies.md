---
"@inflector/vite-plugin-keeno": minor
"@inflector/keeno": minor
"@inflector/keeno-compiler": minor
"create-keeno": minor
---

Add `renderStrategy` to the Vite plugin: `'spa'` (default), `'ssr'` (rendered and streamed per request in dev, `dist/client` + `dist/server` builds served by `createHandler()` from `@inflector/vite-plugin-keeno/server` or `vite preview`), `'ssg'` (every page rendered to HTML at build time, plus `prerender` paths) and `'islands'` (static HTML where only components written with `client="load" | "idle" | "visible"` load JavaScript, each hydrated on its own). Start apps with `start()` from `virtual:keeno-pages`. `create-keeno --render <strategy>` scaffolds each one.

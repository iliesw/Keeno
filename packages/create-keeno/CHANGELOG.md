# create-keeno

## 0.9.0

### Minor Changes

- [#35](https://github.com/iliesw/Keeno/pull/35) [`eecd941`](https://github.com/iliesw/Keeno/commit/eecd941e28bfb44fe4a948590c195a02f2dd0b46) Thanks [@iliesw](https://github.com/iliesw)! - Dev tools for coding agents. During `vite dev`, the plugin serves an MCP server at `/__keeno/mcp` that lets agents such as Claude Code look into the running app: the component tree, props and states, the state timeline, dependencies, performance, routes, the page's console errors, compile and server errors, plus writing states, navigating, time travel and running code in the page. Calls are answered by an open browser tab over Vite's HMR socket, and only local requests are accepted. Add it with `claude mcp add --transport http keeno http://localhost:5173/__keeno/mcp`; new `create-keeno` projects get a `.mcp.json`. Turn it off with `keeno({ mcp: false })`.
  
  The dev tools panel has a new **Agent** tab: **Add to Claude Code** sets the server up in one click (with the `claude` CLI, or in `.mcp.json`), it shows whether an agent is connected, and it lists every tool call live with its arguments, duration and result. Components an agent inspects flash on the page, and state writes made by an agent are marked `agent` in the Timeline.

## 0.8.0

No changes in this release.

## 0.7.1

No changes in this release.

## 0.7.0

### Minor Changes

- [#25](https://github.com/iliesw/Keeno/pull/25) [`d29c991`](https://github.com/iliesw/Keeno/commit/d29c9910cbb496b3130dc8ace71ff5959ec62e4c) Thanks [@iliesw](https://github.com/iliesw)! - Add `renderStrategy` to the Vite plugin: `'spa'` (default), `'ssr'` (rendered and streamed per request in dev, `dist/client` + `dist/server` builds served by `createHandler()` from `@inflector/vite-plugin-keeno/server` or `vite preview`), `'ssg'` (every page rendered to HTML at build time, plus `prerender` paths) and `'islands'` (static HTML where only components written with `client="load" | "idle" | "visible"` load JavaScript, each hydrated on its own). Start apps with `start()` from `virtual:keeno-pages`. `create-keeno --render <strategy>` scaffolds each one.

## 0.6.2

No changes in this release.

## 0.6.1

### Patch Changes

- [#17](https://github.com/iliesw/Keeno/pull/17) [`166bbbd`](https://github.com/iliesw/Keeno/commit/166bbbd16ac91ca825ebe66a4d3713235f1e156a) Thanks [@iliesw](https://github.com/iliesw)! - PR

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.1

### Patch Changes

- [#11](https://github.com/iliesw/Keeno/pull/11) [`c84b228`](https://github.com/iliesw/Keeno/commit/c84b228048f613a9e8fd9bf2f1797d9b4396db03) Thanks [@iliesw](https://github.com/iliesw)! - `--install` no longer prints Node's DEP0190 deprecation warning on Windows.

## 0.4.0

### Minor Changes

- [#10](https://github.com/iliesw/Keeno/pull/10) [`255792c`](https://github.com/iliesw/Keeno/commit/255792c5c4436d2fde676916cf4c899c26ec3541) Thanks [@iliesw](https://github.com/iliesw)! - New package: `bun create keeno` (or `npm create keeno@latest`) scaffolds a Keeno project with Vite, TypeScript and `keeno-check`. Templates: `router` (file-based routing with a layout and a 404 page) and `minimal` (one `App.kn`), with optional Tailwind CSS. Flags: `--template`, `--tailwind`, `--install`, `--force`, `--yes`.

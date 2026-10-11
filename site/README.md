# Lux docs site

The documentation website, built with Lux itself and server-rendered.

```bash
bun run dev      # dev SSR server with HMR on http://localhost:5177 (`--port N` to change)
bun run build    # client + server bundles, and every page prerendered to dist/client
bun run start    # production SSR server for the build
bun run check    # type-check every .lx and .ts file with lux-check
```

Set `SITE_URL=https://your.domain` when building to also write `sitemap.xml`.

## What's in it

- **Docs** come from the repo's [`docs/`](../docs) folder, plus [`content/introduction.md`](content/introduction.md). Order and titles of the sidebar are in [`src/docs.ts`](src/docs.ts). Each page shows a reading time, its last commit date, and an edit link.
- **Examples** ([`src/examples/`](src/examples)): one folder per example, with an `App.lx` entry. They are listed in [`src/examples/index.ts`](src/examples/index.ts) and appear live on `/examples`, each with its own page (`/examples/:slug`) showing the highlighted source. Adding a folder and an entry there is all it takes; `bun scripts/check-examples.ts` compiles them all.
- **Playground** (`/playground`): a CodeMirror editor, the real Lux compiler running in a Web Worker ([`src/playground/compiler.worker.ts`](src/playground/compiler.worker.ts)), and a sandboxed iframe preview with a console, the compiled JS and CSS, multiple files, and share links (the files are compressed into the URL hash). Code blocks of self-contained `.lx` components in the docs get a **Try it** button that opens them there.
- **Search** (`⌘K`, `Ctrl K` or `/`): an index of every docs section, example and page, loaded the first time it opens ([`src/search.ts`](src/search.ts)).

## How it works

- **Markdown:** [`plugins/markdown.ts`](plugins/markdown.ts) renders `.md` imports at build time (marked + highlight.js), so the browser downloads HTML and no parser. Links between docs (`routing.md`) become site routes, `> [!NOTE]`-style blockquotes become callouts, and `bun add` blocks become tabs for bun, npm, pnpm and yarn. It also serves `?highlight` (a source file as a highlighted code block), `?compiled` (what the Lux compiler emits for a component) and `?search` (a page split into sections) imports.
- **Playground runtime:** [`plugins/runtime.ts`](plugins/runtime.ts) bundles the Lux runtime and router with `Bun.build` into strings (`virtual:lux-runtime`). The preview iframe maps `@inflector/lux` to them with an import map, and other bare imports to esm.sh. `virtual:lux-stats` exports their gzipped sizes for the home page.
- **SSR:** [`server.ts`](server.ts) renders each request with `renderToString` ([`src/entry-server.ts`](src/entry-server.ts)). The browser loads the current page's content and calls `hydrate` ([`src/entry-client.ts`](src/entry-client.ts)); after that, `@inflector/lux-router` navigates without reloading. Live examples and the playground editor only run in the browser.
- **Static hosting:** `dist/client` after `bun run build` holds prerendered HTML for every page, a `404.html` and `robots.txt`, so it can be deployed to any static host.

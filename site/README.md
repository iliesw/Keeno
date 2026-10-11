# Lux docs site

The documentation website, built with Lux itself and server-rendered. Its look follows the Aura docs.

```bash
bun run dev      # dev SSR server with HMR on http://localhost:5177 (`--port N` to change)
bun run build    # client + server bundles, and every page prerendered to dist/client
bun run start    # production SSR server for the build
```

- **Content:** pages come from the repo's [`docs/`](../docs) folder, plus [`content/introduction.md`](content/introduction.md). Order and titles of the sidebar are in [`src/docs.ts`](src/docs.ts).
- **Markdown:** [`plugins/markdown.ts`](plugins/markdown.ts) renders `.md` imports at build time (marked + highlight.js), so the browser downloads HTML and no parser. Links between docs (`routing.md`) become site routes.
- **SSR:** [`server.ts`](server.ts) renders each request with `renderToString` ([`src/entry-server.ts`](src/entry-server.ts)). The browser loads the current page's content and calls `hydrate` ([`src/entry-client.ts`](src/entry-client.ts)); after that, `@inflector/lux-router` navigates without reloading.
- **Static hosting:** `dist/client` after `bun run build` holds prerendered HTML for every page and a `404.html`, so it can be deployed to any static host.

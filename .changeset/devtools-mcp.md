---
"@inflector/vite-plugin-keeno": minor
"@inflector/keeno": minor
"create-keeno": minor
---

Dev tools for coding agents. During `vite dev`, the plugin serves an MCP server at `/__keeno/mcp` that lets agents such as Claude Code look into the running app: the component tree, props and states, the state timeline, dependencies, performance, routes, the page's console errors, compile and server errors, plus writing states, navigating, time travel and running code in the page. Calls are answered by an open browser tab over Vite's HMR socket, and only local requests are accepted. Add it with `claude mcp add --transport http keeno http://localhost:5173/__keeno/mcp`; new `create-keeno` projects get a `.mcp.json`. Turn it off with `keeno({ mcp: false })`.

The dev tools panel has a new **Agent** tab: **Add to Claude Code** sets the server up in one click (with the `claude` CLI, or in `.mcp.json`), it shows whether an agent is connected, and it lists every tool call live with its arguments, duration and result. Components an agent inspects flash on the page, and state writes made by an agent are marked `agent` in the Timeline.

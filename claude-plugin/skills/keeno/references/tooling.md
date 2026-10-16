# Tooling

## Vite plugin

`@inflector/vite-plugin-keeno` compiles `.kn` files, serves their CSS, strips TypeScript (with Oxc on Vite 8, and esbuild on Vite 5 to 7) and chains source maps. It supports Vite 5, 6, 7 and 8. Options: `keeno({ hmr?: boolean, tailwind?: boolean | { reference?: string }, devtools?: boolean, useFileRouter?: boolean, pages?: string })` (`KeenoPluginOptions`). `useFileRouter` (default `true`) and `pages` (default `./src/pages`) configure [file-based routing](file-routing.md). `tailwind` defaults to on when `@tailwindcss/vite` is in the plugins (see [Styles](styles.md#tailwind-css)).

During `vite dev` the plugin also turns on development mode: warnings such as duplicate keys in a list, and the dev tools panel (below). Production builds have neither.

## Hot module replacement

In dev, editing a `.kn` file swaps the component in place without a page reload:

- **What re-mounts:** every live instance re-mounts with the same props, and its own state resets.
- **What survives:** parent state.
- **CSS:** style changes apply without re-mounting.

## Dev tools panel

During `vite dev` every page gets an in-page dev tools panel. Open it with the **◆ Keeno** button in the bottom-left corner, or with <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>.

- **Components:** the live component tree. Search it by name or file, and move through it with the arrow keys. Hover a row to outline the component on the page, and double-click a row to scroll the component into view. Rows flash when a component re-renders, and `×N` counts its updates.
- **Inspector:** the selected component's props, plus the states and deriveds declared in its `<script>`, under their variable names. Badges mark `derived`, `persist`, `?url` and `pending` (a debounced write is waiting, or an async derived is loading). An async derived shows its last value, or its error.
  - Click a string, number or `null` to edit it, and click a boolean's checkbox to flip it.
  - Use the pencil button to edit any state as JSON.
  - States with `history` get undo and redo buttons.
  - Under each state, chips show what it reads (←) and what reads it (→): deriveds, and the components whose renders or effects use it. Click a chip to select that component.
  - The file link opens the component in your editor, through Vite's `/__open-in-editor`.
  - The selected component is in `$keeno` in the console, so `$keeno.states.count.set(5)` works there.
- **Picker** (crosshair button, or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>): hover the page to see which component renders each element, then click to select it. <kbd>Esc</kbd> cancels.
- **Highlight updates** (lightning button): outlines components on the page as they re-render.
- **Timeline:** every state write, newest first. It shows the component, the state and what changed; for arrays and objects that is the changed path, for example `todos [1].done false → true`. Writes that came from the URL, another tab or undo/redo get a badge. Errors appear here too. You can filter, pause and clear it, and set a state back to its value before a write.
  - **Time travel:** the slider above the list moves the whole app back and forth through the recorded writes. While you are back in time, the bar turns amber; **Back to live** replays the rest. Replayed writes don't add history, aren't persisted or put in the URL, and aren't logged.
- **Graph:** the dependency graph of the selected component (or of the stores): its states and deriveds, what they read on the left and what reads them on the right, ending with the components that render them. Hover a node to trace its edges, and click a node of another component to select it.
- **Perf:** counts of components, signals, flushes and component updates; flush times (last, average, slowest) with a chart of the recent ones; and the components that update most.
- **Stores:** states and deriveds created outside components (in a shared module, for example) are listed under ◆ Stores at the top of the tree. Only those created after the first `mount()` are tracked. Objects made with `store()` aren't listed yet; log `snapshot(todos)` to inspect one.

The panel is itself a Keeno app, rendered in a shadow root so that it doesn't pick up the app's styles. The dev tools leave it out: it is not in the tree, and its own updates are not counted or logged. It remembers whether it was open, the side it is docked to (dock button), its width and the active tab. It doesn't load in browsers driven by test tools (`navigator.webdriver`), so end-to-end tests don't see it. Turn it off with `keeno({ devtools: false })`. Outside Vite, add `import '@inflector/keeno/devtools'` to your dev entry point.

## Inspecting the component tree from the console

In development mode, the browser console has a `__KEENO_DEVTOOLS__` object (the panel is built on it):

- `__KEENO_DEVTOOLS__.print()` prints the mounted component tree as collapsible groups, with each component's current props.
- `__KEENO_DEVTOOLS__.tree()` returns the same tree as data: `{ name, props, children }[]`.
- `components()` returns it with ids, files and update counts. `details(id)` returns a component's props and states, and `set(stateId, value)` writes a state. `log()` returns the state timeline, `stats()` the performance counters, and `subscribe(fn)` reports every flush and write. `travel(seq)` shows the app as it was after a logged write (`travel(null)` goes back to live), `deps(id)` lists what a signal reads and what reads it, and `graph(componentId)` returns a component's dependency graph as `{ nodes, edges }`.

Outside Vite, turn on development mode with `globalThis.__KEENO_DEV__ = true` before mounting.

## Editor support (VS Code and Cursor)

`packages/vscode` is an extension with:

- Highlighting for script (TypeScript), markup (JSX) and style (CSS).
- TypeScript IntelliSense in `.kn` files, through a Volar-based language server:
  - completions, hover, go to definition and type errors
  - HTML tag, attribute and event completions
  - CSS completions, including Tailwind directives (`@apply`, `@theme`, `@utility`, `@variant`, ...) with no "unknown at-rule" warnings
- `.kn` semantics in the types: a local state reads as its value plus `set`, `get`, `peek`, `onUpdate`, `undo`, `redo`, `canUndo` and `canRedo`.
- Typed props: a component's props type is the type argument of its `props<P>()` call. Using it with a missing or mistyped prop is an error, and prop names complete on its tag. Parents write `children` as nested markup; inside the component it is a `Children` function.

Install "Keeno Framework" (`inflector.inflector-keeno`) from the VS Code Marketplace or Open VSX. To build it from the repo instead:

```bash
bun run --cwd packages/vscode package
code --install-extension packages/vscode/keeno-vscode.vsix
```

### Tailwind CSS IntelliSense

With the [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss) extension installed, `.kn` files get class completions, hover previews and linting in `class="…"`, in `class={…}` strings and in `@apply`. The Keeno extension sets `"tailwindCSS.includeLanguages": { "keeno": "html" }` by default. If you set `tailwindCSS.includeLanguages` yourself, add `"keeno": "html"` to it.

Limitations:
- Props of a component without a `props<P>()` type argument are untyped (`any`).
- A nullable state reads as non-null.
- A plain `<script>` without `lang="ts"` gets completions but no type errors.

## Type checking in CI (`keeno-check`)

`keeno-check` (the `@inflector/keeno-check` package) reports the same type errors as the editor, for every `.kn` and `.ts` file in a tsconfig. It prints `file:line:col - error TSxxxx: message` and exits with 1 when there are errors (2 for a missing tsconfig or a bad option).

Install it with `bun add -d @inflector/keeno-check` and add a script, as `examples/todo` does (`"check": "keeno-check"`), then:

```bash
bun run --cwd examples/todo check
```

- Argument: a tsconfig.json, or a directory that contains one (default: `.`).
- `--kn-only`: check only `.kn` files.
- The tsconfig's `include` must cover the `.kn` files, e.g. `"include": ["src"]`.

## Testing

Use `bun test` with happy-dom registered in a preload (`bunfig.toml`: `[test] preload = ["./test-setup.ts"]`). Mount components with `mount()`, then await a microtask (or call `flush()`) before asserting DOM changes. For async deriveds, resolve the promise your test controls, then wait a tick (`await new Promise((r) => setTimeout(r, 0))`). Directives run in the mount phase, so they have run when `mount()` returns. To test `.kn` files directly, register a Bun plugin that runs `compile()` from `@inflector/keeno-compiler` (see `packages/compiler/test/e2e.test.ts`).

## Compiler

`compile(source, { filename, hmrId? })` from `@inflector/keeno-compiler` returns `{ js, css, map, scope, name }`. The output is TypeScript when the script is.

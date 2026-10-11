# Tooling

## Vite plugin

`@inflector/vite-plugin-lux` compiles `.lx` files, serves their CSS, strips TypeScript (with Oxc on Vite 8, and esbuild on Vite 5 to 7) and chains source maps. It supports Vite 5, 6, 7 and 8. Options: `lux({ hmr?: boolean, tailwind?: boolean | { reference?: string } })`. `tailwind` defaults to on when `@tailwindcss/vite` is in the plugins (see [Styles](styles.md#tailwind-css)).

During `vite dev` the plugin also turns on development mode: warnings such as duplicate keys in a list, and a console hook for inspecting the component tree (below). Production builds have neither.

## Hot module replacement

In dev, editing a `.lx` file swaps the component in place without a page reload:

- **What re-mounts:** every live instance re-mounts with the same props, and its own state resets.
- **What survives:** parent state.
- **CSS:** style changes apply without re-mounting.

## Inspecting the component tree

In development mode, the browser console has a `__LUX_DEVTOOLS__` object:

- `__LUX_DEVTOOLS__.print()` prints the mounted component tree as collapsible groups, with each component's current props.
- `__LUX_DEVTOOLS__.tree()` returns the same tree as data: `{ name, props, children }[]`.

Outside Vite, turn on development mode with `globalThis.__LUX_DEV__ = true` before mounting.

## Editor support (VS Code and Cursor)

`packages/vscode` is an extension with:

- Highlighting for script (TypeScript), markup (JSX) and style (CSS).
- TypeScript IntelliSense in `.lx` files, through a Volar-based language server:
  - completions, hover, go to definition and type errors
  - HTML tag, attribute and event completions
  - CSS completions, including Tailwind directives (`@apply`, `@theme`, `@utility`, `@variant`, ...) with no "unknown at-rule" warnings
- `.lx` semantics in the types: a local state reads as its value plus `set`, `get`, `peek`, `onUpdate`, `undo`, `redo`, `canUndo` and `canRedo`.
- Typed props: a component's props type is the type argument of its `props<P>()` call. Using it with a missing or mistyped prop is an error, and prop names complete on its tag. Parents write `children` as nested markup; inside the component it is a `Children` function.

Install "Lux" (`inflector.lux-vscode`) from the VS Code Marketplace or Open VSX. To build it from the repo instead:

```bash
bun run --cwd packages/vscode package
code --install-extension packages/vscode/lux-vscode.vsix
```

### Tailwind CSS IntelliSense

With the [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss) extension installed, `.lx` files get class completions, hover previews and linting in `class="…"`, in `class={…}` strings and in `@apply`. The Lux extension sets `"tailwindCSS.includeLanguages": { "lux": "html" }` by default. If you set `tailwindCSS.includeLanguages` yourself, add `"lux": "html"` to it.

Limitations:
- Props of a component without a `props<P>()` type argument are untyped (`any`).
- A nullable state reads as non-null.
- A plain `<script>` without `lang="ts"` gets completions but no type errors.

## Type checking in CI (`lux-check`)

`lux-check` (the `@inflector/lux-check` package) reports the same type errors as the editor, for every `.lx` and `.ts` file in a tsconfig. It prints `file:line:col - error TSxxxx: message` and exits with 1 when there are errors (2 for a missing tsconfig or a bad option).

Install it with `bun add -d @inflector/lux-check` and add a script, as `examples/todo` does (`"check": "lux-check"`), then:

```bash
bun run --cwd examples/todo check
```

- Argument: a tsconfig.json, or a directory that contains one (default: `.`).
- `--lx-only`: check only `.lx` files.
- The tsconfig's `include` must cover the `.lx` files, e.g. `"include": ["src"]`.

## Testing

Use `bun test` with happy-dom registered in a preload (`bunfig.toml`: `[test] preload = ["./test-setup.ts"]`). Mount components with `mount()`, then await a microtask (or call `flush()`) before asserting DOM changes. To test `.lx` files directly, register a Bun plugin that runs `compile()` from `@inflector/lux-compiler` (see `packages/compiler/test/e2e.test.ts`).

## Compiler

`compile(source, { filename, hmrId? })` from `@inflector/lux-compiler` returns `{ js, css, map, scope, name }`. The output is TypeScript when the script is.

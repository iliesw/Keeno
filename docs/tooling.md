# Tooling

## Vite plugin

`vite-plugin-lux` compiles `.lx` files, serves their CSS, strips TypeScript with esbuild and chains source maps. Options: `lux({ hmr?: boolean })`.

## Hot module replacement

In dev, editing a `.lx` file swaps the component in place without a page reload:

- **What re-mounts:** every live instance re-mounts with the same props, and its own state resets.
- **What survives:** parent state.
- **CSS:** style changes apply without re-mounting.

## Editor support (VS Code and Cursor)

`packages/vscode` is an extension with:

- Highlighting for script (TypeScript), markup (JSX) and style (CSS).
- TypeScript IntelliSense in `.lx` files, through a Volar-based language server:
  - completions, hover, go to definition and type errors
  - HTML tag, attribute and event completions
  - CSS completions
- `.lx` semantics in the types: a local state reads as its value plus `set`, `get`, `peek`, `onUpdate`, `undo`, `redo`, `canUndo` and `canRedo`.
- Typed props: a component's props type is the type argument of its `props<P>()` call. Using it with a missing or mistyped prop is an error, and prop names complete on its tag. Parents write `children` as nested markup; inside the component it is a `Children` function.

Build and install it:

```bash
bun run --cwd packages/vscode package
code --install-extension packages/vscode/lux-vscode.vsix
```

Limitations:
- Props of a component without a `props<P>()` type argument are untyped (`any`).
- A nullable state reads as non-null.
- A plain `<script>` without `lang="ts"` gets completions but no type errors.

## Type checking in CI (`lux-check`)

`lux-check` (from `packages/lux-check`) reports the same type errors as the editor, for every `.lx` and `.ts` file in a tsconfig. It prints `file:line:col - error TSxxxx: message` and exits with 1 when there are errors (2 for a missing tsconfig or a bad option).

Add it as a dev dependency with a script, as `examples/todo` does (`"check": "lux-check"`), then:

```bash
bun run --cwd examples/todo check
```

- Argument: a tsconfig.json, or a directory that contains one (default: `.`).
- `--lx-only`: check only `.lx` files.
- The tsconfig's `include` must cover the `.lx` files, e.g. `"include": ["src"]`.

## Testing

Use `bun test` with happy-dom registered in a preload (`bunfig.toml`: `[test] preload = ["./test-setup.ts"]`). Mount components with `mount()`, then await a microtask (or call `flush()`) before asserting DOM changes. To test `.lx` files directly, register a Bun plugin that runs `compile()` from `@lux/compiler` (see `packages/compiler/test/e2e.test.ts`).

## Compiler

`compile(source, { filename, hmrId? })` from `@lux/compiler` returns `{ js, css, map, scope, name }`. The output is TypeScript when the script is.

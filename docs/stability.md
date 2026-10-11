# Versioning and support

## Versions

All packages follow [semantic versioning](https://semver.org). Releases and changelogs are managed with [changesets](https://github.com/changesets/changesets), and every release is listed in each package's `CHANGELOG.md`.

While the version is `0.x`:

- A **minor** release (`0.1` → `0.2`) may contain breaking changes. Each one is listed under its changelog entry with migration steps.
- A **patch** release (`0.1.0` → `0.1.1`) only contains fixes and additions.

Pin a minor range (`~0.1.0` or `^0.1.0`, which npm treats the same way below 1.0) and read the changelog before upgrading. `1.0` will mark the API below as stable.

Upgrade `@inflector/keeno`, `@inflector/keeno-compiler` and `@inflector/vite-plugin-keeno` together. Compiled components call helpers from `@inflector/keeno/internal`, and the compiler and the runtime are released in lockstep.

## Public API

Public, and covered by semver:

- Everything exported from `@inflector/keeno` (see the [API reference](api.md)), `@inflector/keeno/server` and `@inflector/keeno-router`.
- The `.kn` file format and the template and script rules in these docs.
- The options of `@inflector/vite-plugin-keeno`, the `keeno-check` CLI, and `compile()` from `@inflector/keeno-compiler`.

Not public: `@inflector/keeno/internal`, the shape of the compiler's output, class names starting with `keeno-`, and anything marked `@internal`. These can change in any release.

## Supported environments

| | Supported |
|---|---|
| Browsers | Last 2 versions of Chrome, Edge, Firefox and Safari (the end-to-end tests run in Chromium, Firefox and WebKit) |
| Node.js | 18 and later for the compiler, Vite plugin, `keeno-check` and server rendering (CI tests Node 20 and 22) |
| Bun | 1.4 and later |
| Vite | 5, 6, 7 and 8 (CI builds a test app with each) |
| TypeScript | 5.0 and later |
| Editors | VS Code 1.90 and later, and editors based on it (Cursor) |

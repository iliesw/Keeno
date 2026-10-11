# Contributing

## Setup

Lux uses [Bun](https://bun.sh) 1.4 for packages, scripts and tests.

```bash
bun install
bun test              # unit, compiler and docs tests (happy-dom)
bun run typecheck
bun run build         # build every package into its dist/
bun run dev           # the todo example with HMR
```

Tests and type-checking run against package sources, so they don't need a build.

## Other checks

These use the built packages, so run `bun run build` first.

```bash
bun run test:e2e:install   # once: Playwright browsers
bun run test:e2e           # example apps in Chromium, Firefox and WebKit
bun run test:smoke         # pack the packages, install them with npm in a fresh app, then build,
                           # type-check and server-render it on Node (add -- --vite=5 for another Vite major)
bun run bench              # rendering benchmarks in Chromium
```

CI runs the unit tests and builds on Linux, Windows and macOS, the end-to-end tests in all three browsers, and the smoke test against Vite 5, 6, 7 and 8. Benchmarks are not run in CI: compare `bun run bench -- --json=before.json` against your branch locally.

## Scripts

Every script must work on Windows. Don't use `&&`, `||`, `rm -rf` or inline `VAR=x` prefixes in `package.json` scripts. Write anything more complex as a Bun script in `scripts/`.

## Changes and releases

Every pull request that changes a published package needs a changeset:

```bash
bunx changeset
```

Pick the packages and the bump (patch for fixes and additions, minor for breaking changes while the version is 0.x; see [docs/stability.md](docs/stability.md)), then write a line for the changelog. Commit the generated `.changeset/*.md` file with your change.

Releases are automated. When changesets land on `main`, the release workflow opens a "Version packages" pull request that bumps the versions and updates the changelogs. Merging that pull request publishes every package whose version isn't on npm yet, with provenance. It also tags the release and publishes the VS Code extension when its version changed.

The release workflow needs these repository secrets:

| Secret | For |
|---|---|
| `NPM_TOKEN` | Publishing to npm. Use a granular token that can publish the `@inflector` scope, or set up npm trusted publishing for this repository and workflow. |
| `VSCE_PAT` | Publishing the extension to the VS Code Marketplace (publisher `inflector`). |
| `OVSX_PAT` | Publishing the extension to Open VSX. |

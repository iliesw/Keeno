# @inflector/keeno-language-server

A [Volar](https://volarjs.dev)-based language server for [Keeno](https://github.com/iliesw/Keeno) `.kn` components. It provides TypeScript completions, hover, go to definition and diagnostics in scripts and markup, plus HTML and CSS completions.

[Keeno for VS Code](https://marketplace.visualstudio.com/items?itemName=inflector.inflector-keeno) bundles it, and [`@inflector/keeno-check`](https://www.npmjs.com/package/@inflector/keeno-check) uses it on the command line. Other editors can start `@inflector/keeno-language-server/server` over stdio. The client must pass `initializationOptions.typescript.tsdk`, the path of TypeScript's `lib` folder.

`createKeenoLanguagePlugin(ts)` from the main entry exposes the `.kn` language plugin for other Volar tools.

MIT license.

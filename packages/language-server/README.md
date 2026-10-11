# @inflector/lux-language-server

A [Volar](https://volarjs.dev)-based language server for [Lux](https://github.com/iliesw/Lux) `.lx` components. It provides TypeScript completions, hover, go to definition and diagnostics in scripts and markup, plus HTML and CSS completions.

[Lux for VS Code](https://marketplace.visualstudio.com/items?itemName=inflector.lux-vscode) bundles it, and [`@inflector/lux-check`](https://www.npmjs.com/package/@inflector/lux-check) uses it on the command line. Other editors can start `@inflector/lux-language-server/server` over stdio. The client must pass `initializationOptions.typescript.tsdk`, the path of TypeScript's `lib` folder.

`createLuxLanguagePlugin(ts)` from the main entry exposes the `.lx` language plugin for other Volar tools.

MIT license.

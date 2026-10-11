# @inflector/keeno-compiler

Compiles [Keeno](https://github.com/iliesw/Keeno) `.kn` single-file components to JavaScript and scoped CSS. Apps don't use it directly: [`@inflector/vite-plugin-keeno`](https://www.npmjs.com/package/@inflector/vite-plugin-keeno) runs it for you.

```ts
import { compile } from '@inflector/keeno-compiler'

const { js, css, map, scope, name } = compile(source, { filename: 'src/Counter.kn' })
```

- `filename` is used for the scope hash, the component name, error messages and source maps. Pass a path relative to the project root, so that hashes are the same on every machine.
- `js` is TypeScript when the component's script is (`<script lang="ts">`). Strip the types before running it.
- Compile errors are thrown with a code frame and a `loc`.

The shape of the output is not part of the public API. See [Tooling](https://github.com/iliesw/Keeno/blob/main/docs/tooling.md). MIT license.

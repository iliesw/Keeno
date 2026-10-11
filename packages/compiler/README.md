# @inflector/lux-compiler

Compiles [Lux](https://github.com/iliesw/Lux) `.lx` single-file components to JavaScript and scoped CSS. Apps don't use it directly: [`@inflector/vite-plugin-lux`](https://www.npmjs.com/package/@inflector/vite-plugin-lux) runs it for you.

```ts
import { compile } from '@inflector/lux-compiler'

const { js, css, map, scope, name } = compile(source, { filename: 'src/Counter.lx' })
```

- `filename` is used for the scope hash, the component name, error messages and source maps. Pass a path relative to the project root, so that hashes are the same on every machine.
- `js` is TypeScript when the component's script is (`<script lang="ts">`). Strip the types before running it.
- Compile errors are thrown with a code frame and a `loc`.

The shape of the output is not part of the public API. See [Tooling](https://github.com/iliesw/Lux/blob/main/docs/tooling.md). MIT license.

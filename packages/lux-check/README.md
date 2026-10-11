# @inflector/lux-check

Type-checks a [Lux](https://github.com/iliesw/Lux) project from the command line, with the same results as the editor extension: every `.lx` and `.ts` file that a `tsconfig.json` includes.

```bash
bun add -d @inflector/lux-check
```

```json
{ "scripts": { "check": "lux-check" } }
```

```
lux-check [project] [--lx-only]
```

- `project` is a `tsconfig.json`, or a directory that contains one (default: `.`). Its `include` must cover the `.lx` files.
- `--lx-only` checks only `.lx` files.
- Errors are printed as `file:line:col - error TSxxxx: message`. The exit code is 1 when there are errors, and 2 for a usage error.

`typescript` (5.0 or later) is a peer dependency. MIT license.

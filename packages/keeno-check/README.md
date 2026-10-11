# @inflector/keeno-check

Type-checks a [Keeno](https://github.com/iliesw/Keeno) project from the command line, with the same results as the editor extension: every `.kn` and `.ts` file that a `tsconfig.json` includes.

```bash
bun add -d @inflector/keeno-check
```

```json
{ "scripts": { "check": "keeno-check" } }
```

```
keeno-check [project] [--kn-only]
```

- `project` is a `tsconfig.json`, or a directory that contains one (default: `.`). Its `include` must cover the `.kn` files.
- `--kn-only` checks only `.kn` files.
- Errors are printed as `file:line:col - error TSxxxx: message`. The exit code is 1 when there are errors, and 2 for a usage error.

`typescript` (5.0 or later) is a peer dependency. MIT license.

# create-keeno

Scaffolds a new [Keeno](https://github.com/iliesw/Keeno) project.

```bash
bun create keeno my-app
npm create keeno@latest my-app
pnpm create keeno my-app
yarn create keeno my-app
```

It asks for anything not given on the command line:

| Option | |
|---|---|
| `[dir]` | Where to create the project. Its name becomes the package name. |
| `-t, --template` | `router`: pages in `src/pages` with file-based routing, a layout and a 404 page (default). `minimal`: a single `App.kn`. |
| `--tailwind`, `--no-tailwind` | Add Tailwind CSS (default: no). |
| `--install`, `--no-install` | Install dependencies with the package manager that ran the command. |
| `-f, --force` | Write into a non-empty directory. |
| `-y, --yes` | Use the defaults for everything not given, without asking. |

The project uses Vite, TypeScript and `keeno-check`, with `dev`, `build`, `preview` and `check` scripts.

The Keeno package versions it writes are the ones released with this version of create-keeno.

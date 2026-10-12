// `bun dev`: the todo example's Vite dev server, plus the dev tools compiler in watch mode so
// edits to packages/keeno/src/devtools/ui/*.kn show up in the running app (the example loads
// the runtime from source, so Vite picks up the regenerated devtools/gen/*.ts).
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const procs = [
  Bun.spawn([process.execPath, 'run', 'scripts/build-devtools.ts', '--watch'], { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] }),
  Bun.spawn([process.execPath, 'run', 'dev'], { cwd: path.join(root, 'examples/todo'), stdio: ['inherit', 'inherit', 'inherit'] }),
]
const stop = () => {
  for (const p of procs) p.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
// When either exits (e.g. Vite fails to start), stop the other.
await Promise.race(procs.map((p) => p.exited))
stop()

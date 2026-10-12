// Build every publishable package, in dependency order (each one's .d.ts files need its deps' dist/).
import path from 'node:path'

// The dev tools panel is written in Keeno: compile it first, the runtime package bundles it.
const devtools = Bun.spawnSync([process.execPath, 'run', path.join(import.meta.dir, 'build-devtools.ts')], { stdout: 'inherit', stderr: 'inherit' })
if (devtools.exitCode !== 0) process.exit(devtools.exitCode ?? 1)

const order = ['keeno', 'router', 'compiler', 'vite-plugin-keeno', 'language-server', 'keeno-check', 'create-keeno']
const root = path.resolve(import.meta.dir, '..')

for (const name of order) {
  const proc = Bun.spawnSync([process.execPath, 'run', 'build'], {
    cwd: path.join(root, 'packages', name),
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (proc.exitCode !== 0) {
    console.error(`build failed in packages/${name}`)
    process.exit(proc.exitCode ?? 1)
  }
}

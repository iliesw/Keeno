// Build every publishable package, in dependency order (each one's .d.ts files need its deps' dist/).
import path from 'node:path'

const order = ['lux', 'compiler', 'vite-plugin-lux', 'language-server', 'lux-check']
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

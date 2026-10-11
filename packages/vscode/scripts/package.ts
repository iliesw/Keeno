// Build, then package the extension as keeno-vscode.vsix.
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const run = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { cwd: root, stdout: 'inherit', stderr: 'inherit' })
  if (r.exitCode !== 0) process.exit(r.exitCode ?? 1)
}

run(['bun', 'run', 'scripts/build.ts', '--production'])
run(['bun', 'x', 'vsce', 'package', '--no-dependencies', '-o', 'keeno-vscode.vsix'])

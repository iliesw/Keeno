// "Add to Claude Code" in the dev tools: finds where Claude Code has the `keeno` MCP server
// configured, and adds it, with the `claude` CLI when it is installed, else in the project's
// `.mcp.json`.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const SERVER_NAME = 'keeno'

export type Scope = 'local' | 'project' | 'user'

function readJson(file: string): any {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Claude Code keys projects by path, with forward slashes on Windows. */
const samePath = (a: string, b: string) => {
  const norm = (p: string) => path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

/** Where Claude Code has the `keeno` server for `root`: local (this user and project), project (.mcp.json) or user. */
export function findInstall(root: string, home = os.homedir()): { scope: Scope; url: string } | null {
  const config = readJson(path.join(home, '.claude.json'))
  const projects = config?.projects ?? {}
  for (const key of Object.keys(projects)) {
    const server = samePath(key, root) && projects[key]?.mcpServers?.[SERVER_NAME]
    if (server?.url) return { scope: 'local', url: server.url }
  }
  const project = readJson(path.join(root, '.mcp.json'))?.mcpServers?.[SERVER_NAME]
  if (project?.url) return { scope: 'project', url: project.url }
  const user = config?.mcpServers?.[SERVER_NAME]
  if (user?.url) return { scope: 'user', url: user.url }
  return null
}

function run(args: string[], cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    // `claude` may be a .cmd shim on Windows, which only a shell runs. Arguments are checked by
    // the callers (fixed words and a validated URL), so the shell can't be handed anything else.
    const child = spawn('claude', args, { cwd, shell: process.platform === 'win32', windowsHide: true, timeout: 20_000 })
    let out = ''
    child.stdout?.on('data', (d) => (out += d))
    child.stderr?.on('data', (d) => (out += d))
    child.on('error', () => resolve({ code: -1, out: '' }))
    child.on('close', (code) => resolve({ code: code ?? -1, out: out.trim() }))
  })
}

let cli: Promise<boolean> | undefined
/** The `claude` CLI is installed (checked once). */
export function hasCli(root: string): Promise<boolean> {
  return (cli ??= run(['--version'], root).then((r) => r.code === 0))
}

/** A local dev server URL: the only kind of argument passed to the CLI. */
export function isLocalUrl(url: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d{1,5}\/[\w/-]*$/.test(url)
}

/** Add (or point at `url`) the `keeno` server for this project. */
export async function install(root: string, url: string, cli?: boolean): Promise<{ ok: boolean; message: string }> {
  if (!isLocalUrl(url)) return { ok: false, message: `Not a local dev server URL: ${url}` }
  if (cli ?? (await hasCli(root))) {
    await run(['mcp', 'remove', SERVER_NAME, '-s', 'local'], root)
    const r = await run(['mcp', 'add', '--transport', 'http', '-s', 'local', SERVER_NAME, url], root)
    if (r.code === 0) {
      return { ok: true, message: 'Added to Claude Code for this project. Start a new Claude Code session here (or run /mcp) to use it.' }
    }
    return { ok: false, message: `claude mcp add failed: ${r.out || `exit code ${r.code}`}` }
  }
  // No CLI: the project's .mcp.json, which Claude Code offers to enable when it starts here.
  const file = path.join(root, '.mcp.json')
  const config = existsSync(file) ? readJson(file) : {}
  if (!config || typeof config !== 'object') return { ok: false, message: `${file} is not valid JSON: fix it or add the server by hand.` }
  config.mcpServers = { ...config.mcpServers, [SERVER_NAME]: { type: 'http', url } }
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n')
  return { ok: true, message: 'Wrote .mcp.json. Claude Code asks to enable it the next time it starts in this project.' }
}

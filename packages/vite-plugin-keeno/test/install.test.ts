import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findInstall, install, isLocalUrl } from '../src/install'

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'keeno-install-'))

describe('Add to Claude Code', () => {
  test('finds the server in local, project and user scope', () => {
    const home = tmp()
    const root = tmp()
    expect(findInstall(root, home)).toBeNull()
    const url = 'http://localhost:5173/__keeno/mcp'
    writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { keeno: { type: 'http', url: 'http://localhost:1/__keeno/mcp' } } }))
    expect(findInstall(root, home)).toEqual({ scope: 'user', url: 'http://localhost:1/__keeno/mcp' })
    writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { keeno: { type: 'http', url } } }))
    expect(findInstall(root, home)?.scope).toBe('project')
    // Claude Code keys projects with forward slashes, even on Windows.
    const key = root.replaceAll(path.sep, '/')
    writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ projects: { [key]: { mcpServers: { keeno: { url } } } } }))
    expect(findInstall(root, home)).toEqual({ scope: 'local', url })
  })

  test('without the CLI, adds the server to .mcp.json and keeps the others', async () => {
    const root = tmp()
    writeFileSync(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }))
    const r = await install(root, 'http://localhost:5174/__keeno/mcp', false)
    expect(r.ok).toBe(true)
    expect(JSON.parse(readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers).toEqual({
      other: { command: 'x' },
      keeno: { type: 'http', url: 'http://localhost:5174/__keeno/mcp' },
    })
  })

  test('only installs local dev server URLs', async () => {
    expect(isLocalUrl('http://localhost:5173/__keeno/mcp')).toBe(true)
    expect(isLocalUrl('http://[::1]:5173/__keeno/mcp')).toBe(true)
    expect(isLocalUrl('http://evil.example/__keeno/mcp')).toBe(false)
    expect(isLocalUrl('http://localhost:5173/x & calc')).toBe(false)
    expect((await install(tmp(), 'http://localhost:5173/a"b', false)).ok).toBe(false)
  })
})

// Publish every package whose current version isn't released yet. Run by the release workflow
// (changesets/action) after the "Version packages" pull request is merged.
//
//   bun run scripts/release.ts [--dry-run]
//
// - npm packages: built, packed with `bun pm pack` (which turns `workspace:` ranges into real
//   versions), then published with `npm publish` (with provenance on GitHub Actions, when the repo is public).
// - The VS Code extension: packaged and published to the Marketplace (VSCE_PAT) and Open VSX
//   (OVSX_PAT) when its version has no git tag yet.
// Each release is tagged `<name>@<version>`, and a `New tag:` line is printed for changesets/action.
import { $ } from 'bun'
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const dryRun = process.argv.includes('--dry-run')
const ci = !!process.env.GITHUB_ACTIONS
// npm rejects provenance from private repositories.
const provenance = ci && process.env.REPO_VISIBILITY === 'public'
const out = path.join(tmpdir(), 'keeno-release')

/** Publish order: dependencies first. */
const npmPackages = ['keeno', 'router', 'compiler', 'vite-plugin-keeno', 'language-server', 'keeno-check']

const readPkg = (dir: string) => JSON.parse(readFileSync(path.join(root, 'packages', dir, 'package.json'), 'utf8'))

async function isPublished(name: string, version: string): Promise<boolean> {
  const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}/${version}`)
  if (res.status === 404) return false
  if (!res.ok) throw new Error(`npm registry: ${res.status} for ${name}@${version}`)
  return true
}

async function hasTag(tag: string): Promise<boolean> {
  const r = await $`git tag --list ${tag}`.cwd(root).quiet()
  return r.stdout.toString().trim() === tag
}

async function tag(name: string) {
  if (dryRun) return console.log(`[release] would tag ${name}`)
  if (!(await hasTag(name))) await $`git tag ${name}`.cwd(root)
  console.log(`New tag: ${name}`)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

console.log('[release] building packages')
await $`bun run build`.cwd(root)

let published = 0
for (const dir of npmPackages) {
  const pkg = readPkg(dir)
  if (pkg.private) continue
  const id = `${pkg.name}@${pkg.version}`
  if (await isPublished(pkg.name, pkg.version)) {
    console.log(`[release] ${id} is already on npm`)
    continue
  }
  const dest = path.join(out, dir)
  mkdirSync(dest, { recursive: true })
  await $`bun pm pack --destination ${dest} --quiet`.cwd(path.join(root, 'packages', dir))
  const tarball = path.join(dest, readdirSync(dest).find((f) => f.endsWith('.tgz'))!)
  // Prereleases (1.0.0-beta.1) go to the `next` dist-tag, so `latest` stays stable.
  const distTag = pkg.version.includes('-') ? 'next' : 'latest'
  const flags = ['--access', 'public', '--tag', distTag]
  if (provenance) flags.push('--provenance')
  if (dryRun) flags.push('--dry-run')
  console.log(`[release] publishing ${id} (${distTag})`)
  await $`npm publish ${tarball} ${flags}`.cwd(root)
  await tag(id)
  published++
}

// VS Code extension
const vscode = readPkg('vscode')
const vscodeTag = `${vscode.name}@${vscode.version}`
if (await hasTag(vscodeTag)) {
  console.log(`[release] ${vscodeTag} is already released`)
} else if (!process.env.VSCE_PAT && !process.env.OVSX_PAT && !dryRun) {
  console.warn(`[release] skipping ${vscodeTag}: set VSCE_PAT and/or OVSX_PAT to publish the extension`)
} else {
  const cwd = path.join(root, 'packages', 'vscode')
  await $`bun run package`.cwd(cwd)
  const vsix = path.join(cwd, 'keeno-vscode.vsix')
  if (dryRun) {
    console.log(`[release] would publish ${vscodeTag} from ${vsix}`)
  } else {
    if (process.env.VSCE_PAT) await $`bun x vsce publish --packagePath ${vsix} --no-dependencies`.cwd(cwd)
    if (process.env.OVSX_PAT) await $`bun x ovsx publish ${vsix} -p ${process.env.OVSX_PAT}`.cwd(cwd)
    await tag(vscodeTag)
  }
}

console.log(`[release] done: ${published} npm package(s) published${dryRun ? ' (dry run)' : ''}`)

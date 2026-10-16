// Generate llms-full.txt (llms.txt followed by every doc it links, in order) and copy the docs
// into the Claude Code skill's references.
// Run with `bun run docs:llms`.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')

/** The docs linked from llms.txt (`docs/*.md`), in link order. */
export function linkedDocs(llms: string): string[] {
  return [...llms.matchAll(/\]\((docs\/[^)]+\.md)\)/g)].map((m) => m[1])
}

export function buildFull(): string {
  const llms = readFileSync(path.join(root, 'llms.txt'), 'utf8').replace(/\r\n/g, '\n')
  const parts = [llms.trimEnd()]
  for (const doc of linkedDocs(llms)) {
    const text = readFileSync(path.join(root, doc), 'utf8').replace(/\r\n/g, '\n').trim()
    parts.push(`<!-- file: ${doc} -->\n\n${text}`)
  }
  return parts.join('\n\n---\n\n') + '\n'
}

/** Where the skill keeps its copy of the docs. */
export const skillReferences = path.join(root, 'claude-plugin/skills/keeno/references')

/** The skill's references: each `docs/*.md` file, unchanged. */
export function buildReferences(): Record<string, string> {
  const docs = readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md'))
  return Object.fromEntries(docs.map((f) => [f, readFileSync(path.join(root, 'docs', f), 'utf8').replace(/\r\n/g, '\n')]))
}

if (import.meta.main) {
  writeFileSync(path.join(root, 'llms-full.txt'), buildFull())
  rmSync(skillReferences, { recursive: true, force: true })
  mkdirSync(skillReferences, { recursive: true })
  for (const [file, text] of Object.entries(buildReferences())) writeFileSync(path.join(skillReferences, file), text)
  console.log('wrote llms-full.txt and the skill references')
}

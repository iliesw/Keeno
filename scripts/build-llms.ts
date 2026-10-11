// Generate llms-full.txt: llms.txt followed by every doc it links, in order.
// Run with `bun run docs:llms`.
import { readFileSync, writeFileSync } from 'node:fs'
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

if (import.meta.main) {
  writeFileSync(path.join(root, 'llms-full.txt'), buildFull())
  console.log('wrote llms-full.txt')
}

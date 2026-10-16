// Keep the docs honest: every doc is linked from llms.txt, llms-full.txt is current, and every
// `.kn` example in the docs compiles.
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { compile } from '../packages/compiler/src/index'
import { buildFull, buildReferences, linkedDocs, skillReferences } from './build-llms'

const root = path.resolve(import.meta.dir, '..')
const docs = readdirSync(path.join(root, 'docs')).filter((f) => f.endsWith('.md'))
const read = (f: string) => readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n')

describe('docs', () => {
  test('llms.txt links every doc', () => {
    const linked = linkedDocs(read('llms.txt'))
    expect(linked.sort()).toEqual(docs.map((d) => `docs/${d}`).sort())
  })

  test('llms-full.txt is up to date (run `bun run docs:llms`)', () => {
    expect(read('llms-full.txt')).toBe(buildFull())
  })

  test('the skill references are up to date (run `bun run docs:llms`)', () => {
    const copied = Object.fromEntries(readdirSync(skillReferences).map((f) => [f, read(path.relative(root, path.join(skillReferences, f)))]))
    expect(copied).toEqual(buildReferences())
  })

  test('SKILL.md links every reference', () => {
    const skill = read('claude-plugin/skills/keeno/SKILL.md')
    const linked = [...skill.matchAll(/\]\(references\/([^)]+\.md)\)/g)].map((m) => m[1])
    expect(linked.sort()).toEqual(docs.slice().sort())
  })

  // Fences written as ```html Name.kn are compiled.
  const examples = docs.flatMap((doc) =>
    [...read(`docs/${doc}`).matchAll(/```html (\S+\.kn)\n([\s\S]*?)```/g)].map((m) => ({ doc, name: m[1], code: m[2] })),
  )

  test('there are compiled examples', () => {
    expect(examples.length).toBeGreaterThan(10)
  })

  for (const ex of examples) {
    test(`${ex.doc}: ${ex.name} compiles`, () => {
      expect(() => compile(ex.code, { filename: `docs/${ex.name}` })).not.toThrow()
    })
  }
})

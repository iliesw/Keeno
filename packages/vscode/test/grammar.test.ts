// Tokenize .lx code with our grammar plus VS Code's own TSX and CSS grammars.
import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import * as oniguruma from 'vscode-oniguruma'
import * as textmate from 'vscode-textmate'

const root = path.resolve(import.meta.dir, '..')

/** VS Code's built-in grammars, if VS Code is installed (user install on Windows). */
function findVSCodeExtensions(): string | undefined {
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'Programs/Microsoft VS Code')
  if (!existsSync(base)) return
  for (const dir of [base, ...readdirSync(base).map((d) => path.join(base, d))]) {
    const ext = path.join(dir, 'resources/app/extensions')
    if (existsSync(path.join(ext, 'typescript-basics'))) return ext
  }
}
const ext = findVSCodeExtensions()

async function loadGrammar() {
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'))
  await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength))
  const files: Record<string, string> = {
    'source.lux': path.join(root, 'syntaxes/lux.tmLanguage.json'),
    'source.tsx': path.join(ext!, 'typescript-basics/syntaxes/TypeScriptReact.tmLanguage.json'),
    'source.css': path.join(ext!, 'css/syntaxes/css.tmLanguage.json'),
  }
  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (p: string[]) => new oniguruma.OnigScanner(p),
      createOnigString: (s: string) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async (scope) => (files[scope] ? textmate.parseRawGrammar(readFileSync(files[scope], 'utf8'), files[scope]) : null),
  })
  return (await registry.loadGrammar('source.lux'))!
}

/** Scopes for each token, as `text => innermost scopes`. */
async function tokenize(code: string) {
  const grammar = await loadGrammar()
  let stack = textmate.INITIAL
  const out: { text: string; scopes: string[] }[] = []
  for (const line of code.split('\n')) {
    const r = grammar.tokenizeLine(line, stack)
    for (const t of r.tokens) out.push({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes })
    stack = r.ruleStack
  }
  return (text: string) => {
    const tok = out.find((t) => t.text.trim() === text)
    if (!tok) throw new Error(`no token "${text}" in ${JSON.stringify(out.map((t) => t.text))}`)
    return tok.scopes.join(' ')
  }
}

const SAMPLE = `<!-- Counter -->
<script lang="ts">
  const count = state<number>(0)
</script>

<h1 class="heading">{title}: {count}</h1>
<Item key={t.id} bind:value={name} />

<style>
  h1 { color: teal }
</style>
`

describe.skipIf(!ext)('grammar', () => {
  test('script is TypeScript', async () => {
    const scope = await tokenize(SAMPLE)
    expect(scope('const')).toContain('meta.embedded.block.lux.script')
    expect(scope('const')).toContain('storage.type')
    expect(scope('number')).toContain('support.type.primitive')
    expect(scope('script')).toContain('entity.name.tag.script.html')
  })

  test('markup is JSX with embedded expressions', async () => {
    const scope = await tokenize(SAMPLE)
    expect(scope('h1')).toContain('entity.name.tag')
    expect(scope('class')).toContain('entity.other.attribute-name')
    expect(scope('Item')).toContain('support.class.component')
    expect(scope('title')).toContain('meta.embedded.expression')
    expect(scope(':')).not.toContain('meta.embedded.expression')
  })

  test('style is CSS', async () => {
    const scope = await tokenize(SAMPLE)
    expect(scope('color')).toContain('meta.embedded.block.lux.style')
    expect(scope('color')).toContain('support.type.property-name.css')
  })

  test('HTML comments', async () => {
    const scope = await tokenize(SAMPLE)
    expect(scope('Counter')).toContain('comment.block.html')
  })
})

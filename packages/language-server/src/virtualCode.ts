// Turn an .lx file into a TSX virtual file that TypeScript understands, plus a CSS virtual file.
//
//   <script> imports            -> module level (`from '@inflector/lux'` becomes `from '@inflector/lux/lx'`)
//   auto-imported lux APIs      -> `import { state, ... } from '@inflector/lux/lx'` (editor typings)
//   rest of <script>            -> body of `export default function __LuxComponent($$props) { … }`
//   markup                      -> `return (<> … </>)` at the end of that body
//
// Typed props: when the script calls `props<P>()`, the body goes in `function __LuxRender()`
// instead, which returns `[P, markup]`. The type argument is copied (unmapped) to the end of the
// body, where every type the script declares is in scope. The default export then takes
// `LxComponentProps<P>`, read back through `ReturnType<typeof __LuxRender>`. Without a type
// argument, or in plain JS, props stay `Record<string, any>`.
//
// Source text is copied verbatim and mapped back, so TypeScript's completions, hovers,
// diagnostics and go-to-definition land on the right spot in the .lx file. Parsing uses the
// TypeScript parser, which tolerates the half-typed code an editor sends.
import { split, type SplitResult } from '@inflector/lux-compiler/split'
import type { CodeInformation, CodeMapping, VirtualCode } from '@volar/language-core'
import type * as TS from 'typescript'

const LUX_APIS = ['state', 'derived', 'props', 'init', 'update', 'destroy']

export const FEATURES: CodeInformation = {
  completion: true,
  format: false,
  navigation: true,
  semantic: true,
  structure: true,
  verification: true,
}

class Builder {
  text = ''
  mappings: CodeMapping[] = []

  add(s: string) {
    this.text += s
  }

  /** Append `s`, mapped to `sourceOffset` in the .lx file. */
  map(sourceOffset: number, s: string) {
    if (!s) return
    this.mappings.push({
      sourceOffsets: [sourceOffset],
      generatedOffsets: [this.text.length],
      lengths: [s.length],
      data: FEATURES,
    })
    this.text += s
  }
}

function safeSplit(source: string): SplitResult {
  try {
    return split(source)
  } catch {
    return { script: null, style: null, lang: 'ts', markup: source, scriptSource: '', ranges: [] }
  }
}

function bindingNames(ts: typeof TS, name: TS.BindingName, out: Set<string>) {
  if (ts.isIdentifier(name)) out.add(name.text)
  else for (const el of name.elements) if (!ts.isOmittedExpression(el)) bindingNames(ts, el.name, out)
}

/** Names declared at the top level of the script (imports and declarations). */
function declaredNames(ts: typeof TS, sf: TS.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause) {
      const c = st.importClause
      if (c.name) names.add(c.name.text)
      const nb = c.namedBindings
      if (nb && ts.isNamespaceImport(nb)) names.add(nb.name.text)
      else if (nb) for (const el of nb.elements) names.add(el.name.text)
    } else if (ts.isImportEqualsDeclaration(st)) {
      names.add(st.name.text)
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) bindingNames(ts, d.name, names)
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) {
      names.add(st.name.text)
    }
  }
  return names
}

/** The type argument of the script's `props<P>()` call, unless the script declares its own `props`. */
function propsTypeText(ts: typeof TS, sf: TS.SourceFile): string | undefined {
  const shadowed = sf.statements.some(
    (st) =>
      (ts.isFunctionDeclaration(st) && st.name?.text === 'props') ||
      (ts.isVariableStatement(st) &&
        st.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === 'props')),
  )
  if (shadowed) return
  let found: string | undefined
  const visit = (node: TS.Node): void => {
    if (found !== undefined) return
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'props' &&
      node.typeArguments?.length === 1
    ) {
      found = node.typeArguments[0].getText(sf)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

export interface GeneratedScript {
  text: string
  mappings: CodeMapping[]
  lang: 'ts' | 'js'
}

export function generateScript(ts: typeof TS, source: string, parts = safeSplit(source)): GeneratedScript {
  const b = new Builder()
  const offset = parts.script?.start ?? 0
  const script = parts.script?.content ?? ''
  const sf = ts.createSourceFile('script.tsx', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const imports = sf.statements.filter((s) => ts.isImportDeclaration(s) || ts.isImportEqualsDeclaration(s))

  for (const imp of imports) {
    const start = imp.getStart(sf)
    const spec = ts.isImportDeclaration(imp) ? imp.moduleSpecifier : undefined
    if (spec && ts.isStringLiteral(spec) && spec.text === '@inflector/lux') {
      b.map(offset + start, script.slice(start, spec.getStart(sf)))
      b.add(`'@inflector/lux/lx'`)
      b.map(offset + spec.end, script.slice(spec.end, imp.end))
    } else {
      b.map(offset + start, script.slice(start, imp.end))
    }
    b.add('\n')
  }
  const declared = declaredNames(ts, sf)
  const missing = LUX_APIS.filter((n) => !declared.has(n))
  if (missing.length) b.add(`import { ${missing.join(', ')} } from '@inflector/lux/lx';\n`)

  const propsType = parts.lang === 'ts' ? propsTypeText(ts, sf) : undefined
  b.add(propsType ? 'function __LuxRender() {\n' : 'export default function __LuxComponent($$props: Record<string, any>) {\n')
  let pos = 0
  for (const imp of imports) {
    b.map(offset + pos, script.slice(pos, imp.getStart(sf)))
    b.add('\n')
    pos = imp.end
  }
  b.map(offset + pos, script.slice(pos))

  b.add(propsType ? `\nreturn [undefined as unknown as (${propsType}), (<>\n` : '\nreturn (<>\n')
  let p = 0
  for (const [start, end] of parts.ranges) {
    if (start > p) {
      b.map(p, source.slice(p, start))
      b.add(' ')
    }
    p = Math.max(p, end)
  }
  b.map(p, source.slice(p))
  if (propsType) {
    b.add('\n</>)] as const;\n}\n')
    b.add(
      "export default function __LuxComponent($$props: import('@inflector/lux/lx').LxComponentProps<ReturnType<typeof __LuxRender>[0]>) {\n" +
        '  return __LuxRender()[1]\n}\n',
    )
  } else b.add('\n</>);\n}\n')

  return { text: b.text, mappings: b.mappings, lang: parts.lang }
}

function textSnapshot(text: string): TS.IScriptSnapshot {
  return {
    getText: (start, end) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  }
}

export class LuxVirtualCode implements VirtualCode {
  id = 'root'
  languageId = 'lux'
  mappings: CodeMapping[]
  embeddedCodes: VirtualCode[] = []
  lang: 'ts' | 'js'

  constructor(
    public snapshot: TS.IScriptSnapshot,
    ts: typeof TS,
  ) {
    const source = snapshot.getText(0, snapshot.getLength())
    this.mappings = [{ sourceOffsets: [0], generatedOffsets: [0], lengths: [source.length], data: FEATURES }]
    const parts = safeSplit(source)
    const script = generateScript(ts, source, parts)
    this.lang = script.lang
    this.embeddedCodes.push({
      id: 'script',
      languageId: script.lang === 'ts' ? 'typescriptreact' : 'javascriptreact',
      snapshot: textSnapshot(script.text),
      mappings: script.mappings,
    })
    if (parts.style) {
      const css = parts.style.content
      this.embeddedCodes.push({
        id: 'style',
        languageId: 'css',
        snapshot: textSnapshot(css),
        mappings: [{ sourceOffsets: [parts.style.start], generatedOffsets: [0], lengths: [css.length], data: FEATURES }],
      })
    }
  }
}


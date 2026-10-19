// Turn an .kn file into a TSX virtual file that TypeScript understands, plus a CSS virtual file.
//
//   <script> imports            -> module level (`from '@inflector/keeno'` becomes `from '@inflector/keeno/kn'`)
//   auto-imported keeno APIs      -> `import { state, ... } from '@inflector/keeno/kn'` (editor typings)
//   rest of <script>            -> body of `export default function Name($$props) { … }`
//   markup                      -> `return (<> … </>)` at the end of that body
//
// Typed props: when the script calls `props<P>()`, the body goes in `function __KeenoRender()`
// instead, which returns `[P, markup]`. The type argument is copied (unmapped) to the end of the
// body, where every type the script declares is in scope. The default export then takes
// `KnComponentProps<P>`, read back through `ReturnType<typeof __KeenoRender>`. Without a type
// argument, or in plain JS, props stay `Record<string, any>`.
//
// `Name` comes from the file (`todo-item.kn` -> `TodoItem`, `cards/index.kn` -> `Cards`), so
// TypeScript offers the component under that name in completions and auto-imports. It falls
// back to `__KeenoComponent` when the code already uses the name (an import, a declaration or
// a global it would shadow).
//
// Source text is copied verbatim and mapped back, so TypeScript's completions, hovers,
// diagnostics and go-to-definition land on the right spot in the .kn file. Parsing uses the
// TypeScript parser, which tolerates the half-typed code an editor sends.
import { split, type SplitResult } from '@inflector/keeno-compiler/split'
import type { CodeInformation, CodeMapping, VirtualCode } from '@volar/language-core'
import type * as TS from 'typescript'

const KEENO_APIS = ['state', 'derived', 'store', 'props', 'init', 'update', 'destroy', 'ref', 'server']

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

  /** Append `s`, mapped to `sourceOffset` in the .kn file. */
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

  /** Map the current (empty) position to `sourceOffset`, so an edit inserted here lands there. */
  point(sourceOffset: number) {
    this.mappings.push({ sourceOffsets: [sourceOffset], generatedOffsets: [this.text.length], lengths: [0], data: FEATURES })
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

const FALLBACK_NAME = '__KeenoComponent'

/** The component's name from its .kn file path (`todo-item.kn` -> `TodoItem`), or the fallback. */
export function componentName(fileName: string | undefined): string {
  if (!fileName) return FALLBACK_NAME
  const parts = fileName.split(/[\\/]/).filter(Boolean)
  let base = (parts.pop() ?? '').replace(/\.kn$/, '')
  if (base === 'index') base = parts.pop() ?? ''
  const name = base
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('')
  return /^[A-Z][A-Za-z0-9]*$/.test(name) ? name : FALLBACK_NAME
}

/**
 * Whether the generated code references `name` other than as the default export's own name: an
 * import or declaration (a clash) or a global (which the export would shadow). Property names,
 * attribute names, strings and comments don't count.
 */
function referencesName(ts: typeof TS, text: string, name: string): boolean {
  const sf = ts.createSourceFile('component.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found = false
  const visit = (node: TS.Node): void => {
    if (found) return
    if (ts.isIdentifier(node) && node.text === name) {
      const parent = node.parent
      const own =
        (ts.isFunctionDeclaration(parent) && parent.name === node && parent.parent === sf) ||
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isQualifiedName(parent) && parent.right === node) ||
        ((ts.isPropertyAssignment(parent) ||
          ts.isPropertySignature(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isMethodSignature(parent)) &&
          parent.name === node) ||
        ((ts.isBindingElement(parent) || ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) &&
          parent.propertyName === node) ||
        (ts.isJsxAttribute(parent) && parent.name === node)
      if (!own) found = true
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

/**
 * The TSX virtual file for a .kn source. With `fileName`, the default export is named after the
 * file (see componentName), unless the code already uses that name.
 */
export function generateScript(
  ts: typeof TS,
  source: string,
  parts = safeSplit(source),
  fileName?: string,
): GeneratedScript {
  const name = componentName(fileName)
  const script = buildScript(ts, source, parts, name)
  if (name === FALLBACK_NAME || !referencesName(ts, script.text, name)) return script
  return buildScript(ts, source, parts, FALLBACK_NAME)
}

function buildScript(ts: typeof TS, source: string, parts: SplitResult, name: string): GeneratedScript {
  const b = new Builder()
  const offset = parts.script?.start ?? 0
  const script = parts.script?.content ?? ''
  const sf = ts.createSourceFile('script.tsx', script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const imports = sf.statements.filter((s) => ts.isImportDeclaration(s) || ts.isImportEqualsDeclaration(s))

  const declared = declaredNames(ts, sf)
  const missing = KEENO_APIS.filter((n) => !declared.has(n))
  const directives = directiveEdits(ts, source, parts.ranges)
  if (directives.length) missing.push('__kn_use')
  // TypeScript inserts an auto-import at the start of the line after the last import. The
  // generated import goes first, and that spot is mapped to the line after the script's last
  // import (or to the script's first line), so the edit reaches the .kn file.
  const nextLine = (pos: number) => {
    const nl = script.indexOf('\n', pos)
    return nl >= 0 && !script.slice(pos, nl).trim() ? nl + 1 : pos
  }
  if (missing.length) b.add(`import { ${missing.join(', ')} } from '@inflector/keeno/kn';\n`)
  if (!imports.length && parts.script) b.point(offset + nextLine(0))

  for (const imp of imports) {
    const start = imp.getStart(sf)
    const spec = ts.isImportDeclaration(imp) ? imp.moduleSpecifier : undefined
    if (spec && ts.isStringLiteral(spec) && spec.text === '@inflector/keeno') {
      b.map(offset + start, script.slice(start, spec.getStart(sf)))
      b.add(`'@inflector/keeno/kn'`)
      b.map(offset + spec.end, script.slice(spec.end, imp.end))
    } else {
      b.map(offset + start, script.slice(start, imp.end))
    }
    b.add('\n')
    if (imp === imports[imports.length - 1]) b.point(offset + nextLine(imp.end))
  }

  const propsType = parts.lang === 'ts' ? propsTypeText(ts, sf) : undefined
  b.add(propsType ? 'function __KeenoRender() {\n' : `export default function ${name}($$props: Record<string, any>) {\n`)
  let pos = 0
  for (const imp of imports) {
    b.map(offset + pos, script.slice(pos, imp.getStart(sf)))
    b.add('\n')
    pos = imp.end
  }
  b.map(offset + pos, script.slice(pos))

  b.add(propsType ? `\nreturn [undefined as unknown as (${propsType}), (<>\n` : '\nreturn (<>\n')
  // Markup, with `use:` directives spliced in (see directiveEdits).
  let next = 0
  const copy = (from: number, to: number) => {
    let pos = from
    while (next < directives.length && directives[next]!.at <= to) {
      const edit = directives[next++]!
      if (edit.at < from) continue
      b.map(pos, source.slice(pos, edit.at))
      edit.emit(b)
      pos = edit.at
    }
    b.map(pos, source.slice(pos, to))
  }
  let p = 0
  for (const [start, end] of parts.ranges) {
    if (start > p) {
      copy(p, start)
      b.add(' ')
    }
    p = Math.max(p, end)
  }
  copy(p, source.length)
  if (propsType) {
    b.add('\n</>)] as const;\n}\n')
    b.add(
      `export default function ${name}($$props: import('@inflector/keeno/kn').KnComponentProps<ReturnType<typeof __KeenoRender>[0]>) {\n` +
        '  return __KeenoRender()[1]\n}\n',
    )
  } else b.add('\n</>);\n}\n')

  return { text: b.text, mappings: b.mappings, lang: parts.lang }
}

interface DirectiveEdit {
  /** Offset in the .kn source where generated text goes. */
  at: number
  emit(b: Builder): void
}

/**
 * `use:tooltip={v}` is checked as `use:tooltip={__kn_use(tooltip, v)}` and `use:autofocus` as
 * `use:autofocus={__kn_use(autofocus)}`: the directive name becomes a real (mapped) reference, the
 * value is checked against the directive, and `KnUse` checks the element type.
 */
function directiveEdits(ts: typeof TS, source: string, ranges: [number, number][]): DirectiveEdit[] {
  if (!source.includes('use:')) return []
  // The markup with the <script>/<style> blocks and comments blanked out, so offsets stay the same.
  let markup = source
  for (const [start, end] of ranges) markup = markup.slice(0, start) + ' '.repeat(end - start) + markup.slice(end)
  const sf = ts.createSourceFile('markup.tsx', `<>${markup}</>`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const shift = 2 // the leading `<>`
  const edits: DirectiveEdit[] = []
  const visit = (node: TS.Node) => {
    if (ts.isJsxAttribute(node) && ts.isJsxNamespacedName(node.name) && node.name.namespace.text === 'use') {
      const id = node.name.name
      const nameStart = id.getStart(sf) - shift
      const call = (b: Builder) => {
        b.add('__kn_use(')
        b.map(nameStart, id.text)
      }
      const init = node.initializer
      if (!init) {
        edits.push({ at: node.end - shift, emit: (b) => (b.add('={'), call(b), b.add(')}')) })
      } else if (ts.isJsxExpression(init) && init.expression) {
        edits.push({ at: init.expression.getStart(sf) - shift, emit: (b) => (call(b), b.add(', ')) })
        edits.push({ at: init.expression.end - shift, emit: (b) => b.add(')') })
      } else if (ts.isJsxExpression(init)) {
        edits.push({ at: init.getStart(sf) + 1 - shift, emit: (b) => (call(b), b.add(')')) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return edits.sort((a, b) => a.at - b.at)
}

function textSnapshot(text: string): TS.IScriptSnapshot {
  return {
    getText: (start, end) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  }
}

export class KeenoVirtualCode implements VirtualCode {
  id = 'root'
  languageId = 'keeno'
  mappings: CodeMapping[]
  embeddedCodes: VirtualCode[] = []
  lang: 'ts' | 'js'

  constructor(
    public snapshot: TS.IScriptSnapshot,
    ts: typeof TS,
    fileName?: string,
  ) {
    const source = snapshot.getText(0, snapshot.getLength())
    this.mappings = [{ sourceOffsets: [0], generatedOffsets: [0], lengths: [source.length], data: FEATURES }]
    const parts = safeSplit(source)
    const script = generateScript(ts, source, parts, fileName)
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


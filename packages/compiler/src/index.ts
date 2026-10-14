// compile(source, { filename }) -> { js, css, map }
import * as t from '@babel/types'
import { CompileContext, RUNTIME, generate } from './context'
import { analyze, buildComponentAst, findAutoImports, inferUpdateDeps, rewrite } from './script'
import { split, type SplitResult } from './split'
import { scopeStyle } from './style'
import { compileTemplates } from './template'

export { split } from './split'
export { scopeStyle } from './style'

export interface CompileOptions {
  /** Used for the scope hash, the component name, error messages and source maps. */
  filename: string
  /** Module the runtime is imported from (default `@inflector/keeno`). */
  runtime?: string
  /** Dev only: export a hot-swappable wrapper registered under this id (see `@inflector/keeno/internal` `hot`). */
  hmrId?: string
  /** Development build: name states for the dev tools and record the source file on the component. */
  dev?: boolean
  /**
   * Islands build: `<Comp client="load" | "idle" | "visible" />` renders as an island the browser
   * hydrates on its own. Otherwise the `client` attribute is ignored.
   */
  islands?: boolean
}

export interface CompileResult {
  /** Generated module (still TypeScript if the script was). */
  js: string
  /** Scoped CSS, or '' when there is no <style>. */
  css: string
  map: any
  /** The scope class, e.g. `keeno-1a2b3c4d`. */
  scope: string
  /** Name of the generated component function. */
  name: string
}

/** FNV-1a 32-bit hash as 8 hex characters. */
export function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export function scopeClass(filename: string): string {
  return `keeno-${hash(filename.replace(/\\/g, '/'))}`
}

function componentName(filename: string): string {
  const base = filename.replace(/\\/g, '/').split('/').pop()!.replace(/\.[^.]*$/, '')
  const name = base
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
  return /^[A-Za-z_$]/.test(name) ? name : `Component${name}`
}

/** Inline the IIFE returned by the component function into its body. */
function inlineReturn(fn: t.FunctionDeclaration) {
  const body = fn.body.body
  const ret = body[body.length - 1]
  if (!t.isReturnStatement(ret)) return
  const arg = ret.argument
  if (
    t.isCallExpression(arg) &&
    arg.arguments.length === 0 &&
    t.isArrowFunctionExpression(arg.callee) &&
    arg.callee.params.length === 0 &&
    t.isBlockStatement(arg.callee.body)
  ) {
    body.splice(body.length - 1, 1, ...arg.callee.body.body)
  }
}

export function compile(source: string, options: CompileOptions): CompileResult {
  const parts = split(source)
  try {
    return compileParts(source, parts, options)
  } catch (err: any) {
    // The markup is parsed as `<>…</>`, so its positions on line 1 are 2 columns off. Script
    // positions are exact: they fall inside the script block's range.
    if (err?.loc?.line === 1 && typeof err.pos === 'number' && !parts.ranges.some(([a, b]) => a <= err.pos && err.pos < b)) {
      err.loc = { ...err.loc, column: Math.max(0, err.loc.column - 2) }
    }
    throw err
  }
}

function compileParts(source: string, parts: SplitResult, options: CompileOptions): CompileResult {
  const { filename } = options
  const runtime = options.runtime ?? RUNTIME
  const scope = scopeClass(filename)
  const css = parts.style ? scopeStyle(parts.style.content, scope, filename) : ''
  const ctx = new CompileContext(filename, parts.style ? scope : null)
  if (options.dev) ctx.labels = []
  ctx.islands = !!options.islands
  const name = componentName(filename)

  const file = buildComponentAst(parts, ctx, name)
  analyze(file, ctx)
  inferUpdateDeps(file, ctx)
  rewrite(file, ctx)
  compileTemplates(file, ctx)
  const autoImports = findAutoImports(file)

  const program = file.program
  const exported = program.body[program.body.length - 1] as t.ExportDefaultDeclaration
  const fn = exported.declaration as t.FunctionDeclaration
  inlineReturn(fn)
  if (options.dev) {
    // `const count = state(0)` -> `const count = _$label(state(0), "count")`
    for (const decl of ctx.labels!) {
      decl.init = t.callExpression(ctx.helper('label'), [decl.init!, t.stringLiteral((decl.id as t.Identifier).name)])
    }
  }
  if (options.hmrId || options.dev) {
    // `function Name() {}` (+ `Name.__keenoFile = "src/Name.kn"`) + `export default _$hot(Name, id)`
    const tail: t.Statement[] = [fn]
    if (options.dev) {
      const file = t.stringLiteral(filename.replace(/\\/g, '/'))
      tail.push(t.expressionStatement(t.assignmentExpression('=', t.memberExpression(t.identifier(name), t.identifier('__keenoFile')), file)))
    }
    const value = options.hmrId
      ? t.callExpression(ctx.helper('hot'), [t.identifier(name), t.stringLiteral(options.hmrId)])
      : t.identifier(name)
    program.body.splice(program.body.length - 1, 1, ...tail, t.exportDefaultDeclaration(value))
  }

  const templates = [...ctx.templates.values()].map(({ id, html, svg }) =>
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(id),
        t.callExpression(ctx.helper('template'), svg ? [t.stringLiteral(html), t.booleanLiteral(true)] : [t.stringLiteral(html)]),
      ),
    ]),
  )
  const header: t.Statement[] = []
  if (autoImports.length) {
    header.push(
      t.importDeclaration(
        autoImports.map((n) => t.importSpecifier(t.identifier(n), t.identifier(n))),
        t.stringLiteral(runtime),
      ),
    )
  }
  if (ctx.helpers.size) {
    header.push(
      t.importDeclaration(
        [...ctx.helpers].map(([n, local]) => t.importSpecifier(t.identifier(local), t.identifier(n))),
        t.stringLiteral(`${runtime}/internal`),
      ),
    )
  }

  const firstNonImport = program.body.findIndex((s) => !t.isImportDeclaration(s))
  program.body.splice(firstNonImport, 0, ...templates)
  program.body.unshift(...header)

  const out = generate(
    file,
    { sourceMaps: true, sourceFileName: filename, retainLines: false, jsescOption: { minimal: true } },
    source,
  )
  return { js: out.code, css, map: out.map, scope, name }
}

// Shared compiler state and Babel interop.
import _generate from '@babel/generator'
import _traverse, { type NodePath } from '@babel/traverse'
import * as t from '@babel/types'

// @babel/traverse and @babel/generator are CommonJS; normalise the default export.
export const traverse: typeof _traverse = (_traverse as any).default ?? _traverse
export const generate: typeof _generate = (_generate as any).default ?? _generate

/** Module the runtime APIs are imported from. */
export const RUNTIME = '@inflector/keeno'
/** Names injected from `@inflector/keeno` when used without an import. */
export const KEENO_APIS = ['state', 'derived', 'store', 'props', 'init', 'update', 'destroy', 'ref', 'server'] as const
/** Members of a state (or derived) that are not unwrapped. */
export const RESERVED_MEMBERS = new Set(['set', 'onUpdate', 'get', 'peek', 'undo', 'redo', 'canUndo', 'canRedo', 'refresh'])
/** Callee name of the placeholder that pass 1 emits for keyed `.map()` calls. */
export const MAP_PLACEHOLDER = '__keeno_mapKeyed__'

export interface PropBinding {
  key: string
  default?: t.Expression
  /** A constant holding the default, evaluated once, for defaults that create a new object each time. */
  defaultRef?: t.Identifier
}

export class CompileContext {
  filename: string
  /** Scope class added to elements, or null when the component has no <style>. */
  scope: string | null
  /** Declaring identifiers of bindings that read like states (`state()` and `.map` row params). */
  stateIds = new WeakSet<t.Identifier>()
  /** Subset of `stateIds` declared with `derived()` (read-only). */
  derivedIds = new WeakSet<t.Identifier>()
  /** Declaring identifiers of destructured props. */
  propIds = new WeakMap<t.Identifier, PropBinding>()
  propDeclarators = new WeakSet<t.VariableDeclarator>()
  /** Development mode: `state()`/`derived()` declarations to name for the dev tools. */
  labels: t.VariableDeclarator[] | null = null
  /** State references passed as the state itself instead of being read (`provide(ctx, theme)`). */
  rawStateRefs = new WeakSet<t.Identifier>()
  /** `@inflector/keeno/internal` helpers used by the generated code: name -> local identifier name. */
  helpers = new Map<string, string>()
  /** Hoisted templates, keyed by html (prefixed with `svg:` for SVG fragments). */
  templates = new Map<string, { id: string; html: string; svg: boolean }>()
  /** Islands build (see `CompileOptions.islands`). */
  islands = false
  private uidCounts = new Map<string, number>()

  constructor(filename: string, scope: string | null) {
    this.filename = filename
    this.scope = scope
  }

  helper(name: string): t.Identifier {
    let local = this.helpers.get(name)
    if (!local) this.helpers.set(name, (local = `_$${name}`))
    return t.identifier(local)
  }

  /** `svg`: the html is SVG content without its `<svg>` root, to be parsed in the SVG namespace. */
  template(html: string, svg = false): t.Identifier {
    const key = svg ? `svg:${html}` : html
    let entry = this.templates.get(key)
    if (!entry) this.templates.set(key, (entry = { id: `_tmpl$${this.templates.size + 1}`, html, svg }))
    return t.identifier(entry.id)
  }

  uid(name: string): t.Identifier {
    const n = (this.uidCounts.get(name) ?? 0) + 1
    this.uidCounts.set(name, n)
    return t.identifier(`_${name}$${n}`)
  }
}

export function codeFrameError(path: NodePath | null, message: string): Error {
  if (!path) return new Error(message)
  const err: any = path.buildCodeFrameError(message)
  // Like Babel parse errors: `loc` (column 0-based) and `pos` (see `compile`, which maps them to the .kn file).
  const start = path.node.loc?.start
  if (start) {
    err.loc = { line: start.line, column: start.column }
    err.pos = start.index
  }
  return err
}

/** `() => expr`, or the arrow itself if `expr` is an immediately-invoked, parameterless arrow. */
export function thunk(expr: t.Expression): t.ArrowFunctionExpression {
  if (
    t.isCallExpression(expr) &&
    expr.arguments.length === 0 &&
    t.isArrowFunctionExpression(expr.callee) &&
    expr.callee.params.length === 0
  ) {
    return expr.callee
  }
  return t.arrowFunctionExpression([], expr)
}

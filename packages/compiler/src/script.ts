// Assemble the component function and rewrite state reads, props destructuring and keyed maps.
import { parse, parseExpression } from '@babel/parser'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import {
  CompileContext,
  KEENO_APIS,
  MAP_PLACEHOLDER,
  RESERVED_MEMBERS,
  RUNTIME,
  codeFrameError,
  generate,
  traverse,
  type PropBinding,
} from './context'
import type { SplitResult } from './split'

const PLUGINS: any[] = ['typescript', 'jsx']

/** Statements that stay at module level instead of running per instance. */
function isModuleLevel(node: t.Statement): boolean {
  if (t.isImportDeclaration(node)) return true
  if (t.isTSTypeAliasDeclaration(node) || t.isTSInterfaceDeclaration(node) || t.isTSDeclareFunction(node)) return true
  if (t.isTSModuleDeclaration(node)) return true
  if (t.isExportNamedDeclaration(node) && node.exportKind === 'type') return true
  if (t.isExportNamedDeclaration(node) && (t.isTSTypeAliasDeclaration(node.declaration) || t.isTSInterfaceDeclaration(node.declaration))) return true
  return false
}

/**
 * Build `export default function Name($$props) { <script body>; return <>markup</> }`, with
 * imports and type declarations hoisted to module level.
 */
export function buildComponentAst(parts: SplitResult, ctx: CompileContext, name: string): t.File {
  const opts = { sourceType: 'module' as const, plugins: PLUGINS, sourceFilename: ctx.filename }
  const script = parse(parts.scriptSource, opts)
  const markup = parseExpression(`<>${parts.markup}</>`, opts) as t.JSXFragment

  const moduleLevel: t.Statement[] = []
  const body: t.Statement[] = []
  for (const node of script.program.body) {
    if (isModuleLevel(node)) moduleLevel.push(node)
    else if (t.isExportDeclaration(node)) {
      const err: any = new SyntaxError('Exports are not supported in an .kn <script> (it runs once per instance)')
      err.loc = node.loc?.start
      throw err
    } else body.push(node)
  }

  const fn = t.functionDeclaration(
    t.identifier(name),
    [t.identifier('$$props')],
    t.blockStatement([...body, t.returnStatement(markup)], script.program.directives),
  )
  return t.file(t.program([...moduleLevel, t.exportDefaultDeclaration(fn)], [], 'module'))
}

// ---------------------------------------------------------------------------

/** True if `callee` refers to `name` from `@inflector/keeno` (imported, or unbound and auto-injected). */
export function isKeenoApi(callee: NodePath, name: string): boolean {
  if (!callee.isIdentifier()) return false
  const binding = callee.scope.getBinding(callee.node.name)
  if (!binding) return callee.node.name === name
  if (binding.kind !== 'module') return false
  const spec = binding.path.node
  const decl = binding.path.parentPath?.node
  if (!t.isImportSpecifier(spec) || !t.isImportDeclaration(decl) || decl.source.value !== RUNTIME) return false
  const imported = t.isIdentifier(spec.imported) ? spec.imported.name : spec.imported.value
  return imported === name
}

function replaceRef(path: NodePath, node: t.Expression) {
  node.loc = path.node.loc
  const parent = path.parentPath
  if (parent?.isObjectProperty() && parent.node.shorthand && path.key === 'value') parent.node.shorthand = false
  path.replaceWith(node)
}

function propertyKey(key: t.Node, path: NodePath): string {
  if (t.isIdentifier(key)) return key.name
  if (t.isStringLiteral(key) || t.isNumericLiteral(key)) return String(key.value)
  throw codeFrameError(path, 'Computed keys are not supported here')
}

function memberFor(object: string, key: string): t.MemberExpression {
  return t.isValidIdentifier(key)
    ? t.memberExpression(t.identifier(object), t.identifier(key))
    : t.memberExpression(t.identifier(object), t.stringLiteral(key), true)
}

function jsxBody(fn: t.ArrowFunctionExpression | t.FunctionExpression): t.JSXElement | t.JSXFragment | null {
  const body = fn.body
  if (t.isJSXElement(body) || t.isJSXFragment(body)) return body
  if (t.isBlockStatement(body) && body.body.length === 1) {
    const ret = body.body[0]
    if (t.isReturnStatement(ret) && (t.isJSXElement(ret.argument) || t.isJSXFragment(ret.argument))) return ret.argument
  }
  return null
}

/** Make a `.map` row parameter read like a state (its value becomes `State<T>`). */
function markRowParam(cb: NodePath<t.ArrowFunctionExpression | t.FunctionExpression>, index: number, ctx: CompileContext) {
  const param = cb.node.params[index]
  const paramPath = cb.get('params')[index]
  if (t.isIdentifier(param)) {
    param.typeAnnotation = null
    ctx.stateIds.add(param)
    return
  }
  if (index === 0 && t.isObjectPattern(param)) {
    // `({ id, text }) => …` becomes `(_item) => …` with `text` rewritten to `_item.text`.
    const item = cb.scope.generateUidIdentifier('item')
    for (const prop of param.properties) {
      if (!t.isObjectProperty(prop) || prop.computed || !t.isIdentifier(prop.value)) {
        throw codeFrameError(paramPath, 'Only simple destructuring ({ a, b: c }) is supported in .map() row parameters')
      }
      const key = propertyKey(prop.key, paramPath)
      const binding = cb.scope.getBinding(prop.value.name)!
      if (binding.constantViolations.length) {
        throw codeFrameError(binding.constantViolations[0], `Cannot reassign row parameter "${prop.value.name}"`)
      }
      for (const ref of binding.referencePaths) replaceRef(ref, memberFor(item.name, key))
    }
    const id = t.identifier(item.name)
    cb.node.params[0] = id
    ctx.stateIds.add(id)
    return
  }
  throw codeFrameError(paramPath, 'Unsupported .map() row parameter: use an identifier or simple destructuring')
}

/** Rewrite `X.map(item => <li key={k}>…</li>)` into the keyed-map placeholder. */
function transformMaps(path: NodePath<t.Node>, ctx: CompileContext) {
  if (path.isLogicalExpression()) return transformMaps(path.get('right'), ctx)
  if (path.isConditionalExpression()) {
    transformMaps(path.get('consequent'), ctx)
    transformMaps(path.get('alternate'), ctx)
    return
  }
  if (!path.isCallExpression()) return
  const callee = path.node.callee
  if (!t.isMemberExpression(callee) || callee.computed || !t.isIdentifier(callee.property, { name: 'map' })) return
  if (path.node.arguments.length !== 1) return
  const cb = path.get('arguments')[0]
  if (!cb.isArrowFunctionExpression() && !cb.isFunctionExpression()) return
  const body = jsxBody(cb.node)
  if (!body || cb.node.params.length > 2) return

  // Key function: same parameters, raw item values.
  let keyFn: t.ArrowFunctionExpression
  const keyAttr = t.isJSXElement(body)
    ? body.openingElement.attributes.find(
        (a): a is t.JSXAttribute => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name, { name: 'key' }),
      )
    : undefined
  if (keyAttr && keyAttr.value) {
    const v = keyAttr.value
    const keyExpr = t.isJSXExpressionContainer(v) ? v.expression : v
    if (t.isJSXEmptyExpression(keyExpr) || !t.isExpression(keyExpr)) throw codeFrameError(cb, 'Invalid key attribute')
    const params = cb.node.params.map((p) => {
      const c = t.cloneNode(p, true)
      if ('typeAnnotation' in c) c.typeAnnotation = null
      return c
    }) as t.Identifier[]
    keyFn = t.arrowFunctionExpression(params, keyExpr)
    const el = body as t.JSXElement
    el.openingElement.attributes = el.openingElement.attributes.filter((a) => a !== keyAttr)
  } else {
    const item = cb.scope.generateUidIdentifier('item')
    keyFn = t.arrowFunctionExpression([item], t.identifier(item.name))
  }

  cb.node.params.forEach((_, i) => markRowParam(cb, i, ctx))
  const list = t.arrowFunctionExpression([], callee.object as t.Expression)
  path.replaceWith(t.callExpression(t.identifier(MAP_PLACEHOLDER), [list, keyFn, cb.node]))
}

/** Expressions that evaluate to a new object every time. */
function createsObject(e: t.Expression): boolean {
  if (t.isTSAsExpression(e) || t.isTSSatisfiesExpression(e) || t.isParenthesizedExpression(e)) return createsObject(e.expression)
  return (
    t.isArrayExpression(e) ||
    t.isObjectExpression(e) ||
    t.isArrowFunctionExpression(e) ||
    t.isFunctionExpression(e) ||
    t.isNewExpression(e) ||
    t.isClassExpression(e)
  )
}

function recordProps(path: NodePath<t.VariableDeclarator>, ctx: CompileContext) {
  const pattern = path.node.id as t.ObjectPattern
  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) {
      throw codeFrameError(path, 'Rest props (...rest) are not supported in v1; use `const p = props()` instead')
    }
    if (prop.computed) throw codeFrameError(path, 'Computed keys are not supported in props destructuring')
    const key = propertyKey(prop.key, path)
    let binding: PropBinding
    let id: t.Node = prop.value
    if (t.isAssignmentPattern(id)) {
      binding = { key, default: id.right }
      // `items = []` must give the same array on every read, not a new one (which would make
      // everything depending on it look changed): evaluate it once, where props() is called.
      if (createsObject(id.right)) {
        const ref = path.scope.generateUidIdentifier(`${key}Default`)
        path.parentPath.insertBefore(t.variableDeclaration('const', [t.variableDeclarator(ref, id.right)]))
        binding.defaultRef = ref
      }
      id = id.left
    } else binding = { key }
    if (!t.isIdentifier(id)) throw codeFrameError(path, 'Nested destructuring is not supported in props()')
    ctx.propIds.set(id, binding)
  }
  ctx.propDeclarators.add(path.node)
}

/** Pass 1: find states, props destructuring and keyed `.map` calls in the template. */
export function analyze(file: t.File, ctx: CompileContext) {
  traverse(file, {
    JSXExpressionContainer(path) {
      if (!path.parentPath.isJSXElement() && !path.parentPath.isJSXFragment()) return
      transformMaps(path.get('expression'), ctx)
    },
    VariableDeclarator(path) {
      const init = path.get('init')
      if (!init.isCallExpression()) return
      const callee = init.get('callee')
      if (path.node.id.type === 'Identifier' && isKeenoApi(callee, 'state')) {
        ctx.stateIds.add(path.node.id)
        ctx.labels?.push(path.node)
      } else if (path.node.id.type === 'Identifier' && isKeenoApi(callee, 'derived')) {
        ctx.stateIds.add(path.node.id)
        ctx.derivedIds.add(path.node.id)
        ctx.labels?.push(path.node)
      }
      else if (path.node.id.type === 'ObjectPattern' && isKeenoApi(callee, 'props')) recordProps(path, ctx)
      else if (path.node.id.type === 'Identifier' && isKeenoApi(callee, 'inject')) {
        // `const theme = inject(Theme)` reads like a state: a provided state or derived is used as
        // is, and any other value is wrapped in a read-only signal.
        ctx.stateIds.add(path.node.id)
        path.node.init = t.callExpression(ctx.helper('toSignal'), [init.node])
      }
    },
    CallExpression(path) {
      if (isKeenoApi(path.get('callee'), 'provide')) prepareProvide(path, ctx)
    },
  })
}

/** True if `path` reads a state or a destructured prop. */
function readsReactive(path: NodePath, ctx: CompileContext): boolean {
  let found = false
  const check = (p: NodePath<t.Identifier>) => {
    const id = p.scope.getBinding(p.node.name)?.identifier
    if (id && (ctx.stateIds.has(id) || ctx.propIds.has(id)) && !isInType(p)) found = true
  }
  if (path.isIdentifier()) check(path)
  else path.traverse({ ReferencedIdentifier: (p) => p.isIdentifier() && check(p) })
  return found
}

/**
 * `provide(ctx, value)` keeps the value reactive: a state or derived is passed as itself, and an
 * expression that reads states or props becomes `derived(() => value)`.
 */
function prepareProvide(path: NodePath<t.CallExpression>, ctx: CompileContext) {
  const value = path.get('arguments')[1]
  if (!value || !value.isExpression()) return
  if (value.isIdentifier()) {
    const id = value.scope.getBinding(value.node.name)?.identifier
    if (id && ctx.stateIds.has(id)) {
      ctx.rawStateRefs.add(value.node)
      return
    }
  }
  if (readsReactive(value, ctx)) {
    value.replaceWith(t.callExpression(ctx.helper('derived'), [t.arrowFunctionExpression([], value.node)]))
  }
}

// ---------------------------------------------------------------------------

function isInsideScope(scope: NodePath['scope'] | undefined, inner: NodePath['scope']): boolean {
  for (let s = scope; s; s = s.parent) if (s === inner) return true
  return false
}

/**
 * The value a reference to an outer binding reads inside an `update` callback: the longest
 * `a.b.c` chain, without a called method (`a.b.push()` reads `a.b`) or an assigned property
 * (`a.b = 1` reads `a`). `x.get()` is kept whole. Null when nothing is read (calling `f()`).
 */
function readChain(ref: NodePath<t.Identifier>): t.Expression | null {
  let cur: NodePath = ref
  while (cur.parentPath?.isMemberExpression() && cur.key === 'object' && !cur.parentPath.node.computed) cur = cur.parentPath
  const parent = cur.parentPath!
  const called = parent.isCallExpression() && cur.key === 'callee'
  if (called && cur.isMemberExpression() && t.isIdentifier(cur.node.property, { name: 'get' }) && !parent.node.arguments.length) {
    return parent.node as t.CallExpression
  }
  const written = (parent.isAssignmentExpression() && cur.key === 'left') || parent.isUpdateExpression()
  if (!called && !written) return cur.node as t.Expression
  return cur.isMemberExpression() ? (cur.node.object as t.Expression) : null
}

/**
 * Give each `update(fn)` the deps `fn` reads, so it runs when they change and not on mount:
 * states and deriveds themselves, and getters for props and other outer values (refs, routes).
 */
export function inferUpdateDeps(file: t.File, ctx: CompileContext) {
  traverse.cache.clear()
  traverse(file, {
    CallExpression(call) {
      if (call.node.arguments.length !== 1 || !isKeenoApi(call.get('callee'), 'update')) return
      const fn = call.get('arguments')[0]
      if (!fn.isArrowFunctionExpression() && !fn.isFunctionExpression()) return
      const deps = new Map<string, t.Expression>()
      fn.traverse({
        ReferencedIdentifier(ref) {
          if (!ref.isIdentifier() || isInType(ref)) return
          const binding = ref.scope.getBinding(ref.node.name)
          if (!binding || binding.kind === 'hoisted' || isInsideScope(binding.scope, fn.scope)) return
          if (ctx.stateIds.has(binding.identifier)) {
            const parent = ref.parentPath
            const member = parent.isMemberExpression() && ref.key === 'object' && !parent.node.computed ? parent.node.property : null
            if (t.isIdentifier(member) && member.name !== 'get' && RESERVED_MEMBERS.has(member.name)) return
            deps.set(ref.node.name, t.identifier(ref.node.name))
            return
          }
          const read = readChain(ref)
          if (read) deps.set(generate(read).code, t.arrowFunctionExpression([], t.cloneNode(read, true)))
        },
      })
      if (!deps.size) {
        throw codeFrameError(call, 'update() reads nothing to react to: pass deps (update(fn, [a, b])) or use init() to run once')
      }
      call.node.arguments.push(t.arrayExpression([...deps.values()]))
    },
  })
}

function isInType(path: NodePath): boolean {
  return !!path.findParent((p) => p.isTSType() || p.isTSTypeAnnotation() || p.isTSTypeQuery())
}

/** `x` is a direct element of the deps array in `update(fn, [x])`. */
function isUpdateDep(path: NodePath): boolean {
  const arr = path.parentPath
  if (!arr?.isArrayExpression() || path.listKey !== 'elements') return false
  const call = arr.parentPath
  return !!call?.isCallExpression() && call.node.arguments[1] === arr.node && isKeenoApi(call.get('callee'), 'update')
}

/** `x` is the target of `bind:value={x}`. */
function isBindTarget(path: NodePath): boolean {
  const container = path.parentPath
  const attr = container?.parentPath
  return (
    !!container?.isJSXExpressionContainer() &&
    !!attr?.isJSXAttribute() &&
    t.isJSXNamespacedName(attr.node.name) &&
    attr.node.name.namespace.name === 'bind'
  )
}

function rewriteStateRef(path: NodePath<t.Identifier>, isDerived: boolean, ctx: CompileContext) {
  if (isDerived && isBindTarget(path)) {
    throw codeFrameError(path, `bind: needs a writable state, but "${path.node.name}" is derived (read-only)`)
  }
  const parent = path.parentPath
  if (
    (parent.isMemberExpression() || parent.isOptionalMemberExpression()) &&
    path.key === 'object' &&
    !parent.node.computed &&
    t.isIdentifier(parent.node.property) &&
    RESERVED_MEMBERS.has(parent.node.property.name)
  ) {
    return
  }
  if (isUpdateDep(path) || isBindTarget(path) || ctx.rawStateRefs.has(path.node)) return
  replaceRef(path, t.callExpression(t.memberExpression(t.identifier(path.node.name), t.identifier('get')), []))
}

function rewritePropRef(path: NodePath<t.Identifier>, prop: PropBinding) {
  if (isBindTarget(path)) throw codeFrameError(path, `bind: needs a state, but "${path.node.name}" is a prop`)
  let expr: t.Expression = memberFor('$$props', prop.key)
  if (prop.default) expr = t.logicalExpression('??', expr, t.cloneNode(prop.defaultRef ?? prop.default, true))
  if (isUpdateDep(path)) expr = t.arrowFunctionExpression([], expr)
  replaceRef(path, expr)
}

/**
 * Pass 2: rewrite state reads to `x.get()` and destructured props to `$$props.x`.
 */
export function rewrite(file: t.File, ctx: CompileContext) {
  traverse.cache.clear()
  const checked = new WeakSet<object>()
  const propDeclarators: NodePath<t.VariableDeclarator>[] = []

  const checkViolations = (path: NodePath<t.Identifier>, what: string) => {
    const binding = path.scope.getBinding(path.node.name)
    if (!binding || checked.has(binding)) return
    checked.add(binding)
    const v = binding.constantViolations[0]
    if (v) throw codeFrameError(v, `Cannot reassign ${what} "${path.node.name}"${what === 'state' ? `; use ${path.node.name}.set(…)` : ''}`)
  }

  traverse(file, {
    Program: {
      exit() {
        for (const p of propDeclarators) p.remove()
      },
    },
    VariableDeclarator(path) {
      if (ctx.propDeclarators.has(path.node)) {
        propDeclarators.push(path)
        for (const [name, id] of Object.entries(path.getBindingIdentifierPaths())) {
          if (ctx.propIds.has(id.node)) checkViolations(id, 'prop')
        }
      }
      const id = path.get('id')
      if (id.isIdentifier() && ctx.stateIds.has(id.node)) checkViolations(id, 'state')
    },
    ReferencedIdentifier(path) {
      if (!path.isIdentifier()) return
      const binding = path.scope.getBinding(path.node.name)
      if (!binding) return
      const id = binding.identifier
      const isState = ctx.stateIds.has(id)
      const prop = isState ? undefined : ctx.propIds.get(id)
      if (!isState && !prop) return
      if (isInType(path)) return
      checkViolations(path, isState ? 'state' : 'prop')
      if (isState) rewriteStateRef(path, ctx.derivedIds.has(id), ctx)
      else rewritePropRef(path, prop!)
    },
  })
}

/** The `@inflector/keeno` APIs the module uses without importing them. */
export function findAutoImports(file: t.File): string[] {
  traverse.cache.clear()
  const found: string[] = []
  traverse(file, {
    Program(path) {
      const globals = (path.scope as any).globals as Record<string, unknown>
      for (const name of KEENO_APIS) if (globals[name]) found.push(name)
      path.stop()
    },
  })
  return found
}

// server(fn): functions that run on the server, called from the browser over HTTP.
//
// Each `server(async (…) => …)` call is replaced with a stub that knows the function's id. In the
// server build the function is hoisted to module level and exported in `$$serverFns`, where the
// request handler finds it; in the browser build it is dropped, with the imports and declarations
// only it used, so server code (a database client, secrets) never reaches the bundle.
import { parse } from '@babel/parser'
import type { Binding, NodePath, Scope } from '@babel/traverse'
import * as t from '@babel/types'
import { RUNTIME, codeFrameError, generate, traverse } from './context'

export interface ServerFunctionOptions {
  /** The server build: keep the functions. Otherwise they become stubs. */
  ssr: boolean
  /** Identifies the module in function ids (`<id>/<index>`): a hash of its path. */
  id: string
  /** `server` must be imported from `@inflector/keeno` (in .ts files: .kn files auto-import it). */
  requireImport?: boolean
}

/** The export that lists a module's server functions by index. */
export const SERVER_FNS = '$$serverFns'

/** True if `path` calls the keeno `server` (imported from the runtime, or unbound in a .kn file). */
function isServerCall(path: NodePath<t.CallExpression>, requireImport: boolean): boolean {
  const callee = path.node.callee
  if (!t.isIdentifier(callee, { name: 'server' })) return false
  const binding = path.scope.getBinding('server')
  if (!binding) return !requireImport
  if (binding.kind !== 'module') return false
  const spec = binding.path.node
  const decl = binding.path.parent
  return (
    t.isImportSpecifier(spec) &&
    t.isIdentifier(spec.imported, { name: 'server' }) &&
    t.isImportDeclaration(decl) &&
    decl.source.value === RUNTIME
  )
}

function within(scope: Scope, ancestor: Scope): boolean {
  for (let s: Scope | undefined = scope; s; s = s.parent) if (s === ancestor) return true
  return false
}

/**
 * Replace the `server(fn)` calls of `file` (see the top of this file). Returns the
 * `export const $$serverFns = { … }` statement for the server build, or null. Returns the
 * number of functions found as `count`.
 */
export function extractServerFunctions(file: t.File, options: ServerFunctionOptions): { count: number; exports: t.Statement | null } {
  traverse.cache.clear()
  let program!: NodePath<t.Program>
  const hoisted: t.Identifier[] = []
  /** Module-level names the dropped functions used: removed if nothing else uses them. */
  const used = new Set<string>()

  traverse(file, {
    Program(path) {
      program = path
    },
    CallExpression(path) {
      if (!isServerCall(path, !!options.requireImport)) return
      const fnPath = path.get('arguments')[0] as NodePath | undefined
      if (!fnPath || !(fnPath.isArrowFunctionExpression() || fnPath.isFunctionExpression()) || path.node.arguments.length !== 1) {
        throw codeFrameError(path, 'server() takes one function: server(async (…) => { … })')
      }
      const programScope = path.scope.getProgramParent()
      // It runs on the server, apart from the component: only its arguments, imports and
      // module-level declarations exist there.
      fnPath.traverse({
        ReferencedIdentifier(ref) {
          const name = (ref.node as t.Identifier).name
          const binding: Binding | undefined = ref.scope.getBinding(name)
          if (!binding) return
          if (binding.scope === programScope) {
            used.add(name)
            return
          }
          if (within(binding.scope, fnPath.scope)) return
          throw codeFrameError(ref, `server() can't use \`${name}\`: it runs on the server, so pass it as an argument`)
        },
      })
      const index = hoisted.length
      const id = t.stringLiteral(`${options.id}/${index}`)
      const local = t.identifier(`$$server${index}`)
      hoisted.push(local)
      if (options.ssr) {
        // `const $$server0 = fn` before the module-level statement that holds the call.
        const top = path.find((p) => p.parentPath?.isProgram() ?? false)!
        top.insertBefore(t.variableDeclaration('const', [t.variableDeclarator(local, fnPath.node as t.Expression)]))
        path.replaceWith(t.callExpression(t.identifier('server'), [t.cloneNode(local), id]))
      } else {
        path.replaceWith(t.callExpression(t.identifier('server'), [id]))
      }
      path.skip()
    },
  })

  if (!hoisted.length) return { count: 0, exports: null }
  if (!options.ssr) prune(program, used)
  const exports = options.ssr
    ? t.exportNamedDeclaration(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(SERVER_FNS),
            t.objectExpression(hoisted.map((local, i) => t.objectProperty(t.numericLiteral(i), t.cloneNode(local)))),
          ),
        ]),
      )
    : null
  return { count: hoisted.length, exports }
}

/** Remove the module-level imports and declarations in `names` that nothing references anymore. */
function prune(program: NodePath<t.Program>, names: Set<string>) {
  let pending = [...names]
  while (pending.length) {
    program.scope.crawl()
    const next: string[] = []
    for (const name of pending) {
      const binding = program.scope.getBinding(name)
      if (!binding || binding.referenced || binding.path.removed) continue
      const p = binding.path
      if (p.isImportSpecifier() || p.isImportDefaultSpecifier() || p.isImportNamespaceSpecifier()) {
        const decl = p.parentPath as NodePath<t.ImportDeclaration>
        p.remove()
        if (!decl.node.specifiers.length) decl.remove()
        continue
      }
      const exported = (q: NodePath) => q.parentPath?.isExportNamedDeclaration() || q.parentPath?.parentPath?.isExportNamedDeclaration()
      if (p.isVariableDeclarator() && t.isIdentifier(p.node.id) && !exported(p)) {
        collect(p, next)
        const decl = p.parentPath as NodePath<t.VariableDeclaration>
        if (decl.node.declarations.length === 1) decl.remove()
        else p.remove()
      } else if (p.isFunctionDeclaration() && !exported(p)) {
        collect(p, next)
        p.remove()
      }
    }
    pending = next
  }
}

/** The module-level names `path` references, which may become unused once it is removed. */
function collect(path: NodePath, out: string[]) {
  const programScope = path.scope.getProgramParent()
  path.traverse({
    ReferencedIdentifier(ref) {
      const name = (ref.node as t.Identifier).name
      if (ref.scope.getBinding(name)?.scope === programScope) out.push(name)
    },
  })
}

/**
 * The `server()` pass for a `.ts`/`.js` module: the transformed code, or null when it has no
 * server functions (`server` imported from `@inflector/keeno`).
 */
export function transformServerFunctions(
  code: string,
  options: { filename: string; id: string; ssr: boolean },
): { code: string; map: any } | null {
  if (!code.includes('server(')) return null
  const file = parse(code, { sourceType: 'module', plugins: ['typescript', 'jsx'], sourceFilename: options.filename })
  const { count, exports } = extractServerFunctions(file, { ssr: options.ssr, id: options.id, requireImport: true })
  if (!count) return null
  if (exports) file.program.body.push(exports)
  const out = generate(file, { sourceMaps: true, sourceFileName: options.filename, jsescOption: { minimal: true } }, code)
  return { code: out.code, map: out.map }
}

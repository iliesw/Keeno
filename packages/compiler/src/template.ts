// JSX -> DOM codegen: hoisted templates plus insert/attr/on/bind/createComponent calls.
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { CompileContext, MAP_PLACEHOLDER, codeFrameError, thunk, traverse } from './context'

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr',
])
const ATTR_ALIASES: Record<string, string> = { className: 'class', htmlFor: 'for' }

/**
 * Elements that only exist in SVG. A template whose root is one of these (or that sits inside an
 * `<svg>` in the markup) is parsed inside an `<svg>` wrapper, so it gets the SVG namespace.
 * Tags that exist in both HTML and SVG (`a`, `title`, `style`, `script`) rely on the markup context.
 */
const SVG_TAGS = new Set(
  (
    'animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix ' +
    'feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight ' +
    'feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode ' +
    'feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter ' +
    'foreignObject g image line linearGradient marker mask metadata mpath path pattern polygon polyline ' +
    'radialGradient rect set stop switch symbol text textPath tspan use view'
  ).split(' '),
)

/**
 * Children the HTML parser keeps in place inside table elements. Anything else is moved (an
 * implied <tbody>, <tr> or <colgroup> is inserted, or the node is foster-parented out of the
 * table), and the compiled firstChild/nextSibling paths would no longer match.
 */
const TABLE_CHILDREN: Record<string, string[]> = {
  table: ['caption', 'colgroup', 'thead', 'tbody', 'tfoot'],
  thead: ['tr'],
  tbody: ['tr'],
  tfoot: ['tr'],
  tr: ['td', 'th'],
  colgroup: ['col'],
}
const TABLE_ANYWHERE = ['template', 'script', 'style']

/** Why `child` (a tag, or null for text) cannot be written directly inside `parent`, if so. */
function tablePlacementError(parent: string, child: string | null): string | undefined {
  const allowed = TABLE_CHILDREN[parent]
  if (!allowed) return
  if (child === null) {
    return `Text cannot be a direct child of <${parent}>: the HTML parser would move it out of the table. Put it in a <td>, <th> or <caption>.`
  }
  if (allowed.includes(child) || TABLE_ANYWHERE.includes(child)) return
  const implied =
    child === 'tr' ? 'tbody' : child === 'td' || child === 'th' ? 'tr' : child === 'col' && parent === 'table' ? 'colgroup' : null
  if (implied) {
    return (
      `<${child}> cannot be a direct child of <${parent}>: the HTML parser would insert a <${implied}> and break the template. ` +
      `Wrap it in <${implied}>${implied === 'tbody' ? ' (or <thead>/<tfoot>)' : ''}.`
    )
  }
  const list = allowed.map((a) => `<${a}>`).join(', ')
  return `<${child}> cannot be a direct child of <${parent}>: the HTML parser would move it out of the table. Allowed: ${list}.`
}

/** True if the JSX root at `path` sits inside SVG content in the markup (not under <foreignObject>). */
function inSvgContext(path: NodePath): boolean {
  for (let p = path.parentPath; p; p = p.parentPath) {
    if (!p.isJSXElement() || isComponent(p.node)) continue
    const tag = tagName(p.node.openingElement.name)
    return tag === 'svg' || (tag !== 'foreignObject' && SVG_TAGS.has(tag))
  }
  return false
}

type Child =
  | { kind: 'text'; value: string }
  | { kind: 'expr'; expr: t.Expression; node: t.Node }
  | { kind: 'element'; node: t.JSXElement }

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** JSX whitespace rules (same as React/Babel): trim lines, drop whitespace-only lines. */
export function cleanJSXText(value: string): string {
  const lines = value.split(/\r\n|\n|\r/)
  let lastNonEmpty = 0
  lines.forEach((line, i) => {
    if (/[^ \t]/.test(line)) lastNonEmpty = i
  })
  let out = ''
  lines.forEach((line, i) => {
    let s = line.replace(/\t/g, ' ')
    if (i !== 0) s = s.replace(/^[ ]+/, '')
    if (i !== lines.length - 1) s = s.replace(/[ ]+$/, '')
    if (s) {
      if (i !== lastNonEmpty) s += ' '
      out += s
    }
  })
  return out
}

function tagName(name: t.JSXOpeningElement['name']): string {
  if (t.isJSXIdentifier(name)) return name.name
  if (t.isJSXNamespacedName(name)) return `${name.namespace.name}:${name.name.name}`
  return '' // member expression: always a component
}

function isComponent(node: t.JSXElement): boolean {
  const name = node.openingElement.name
  if (t.isJSXMemberExpression(name)) return true
  return t.isJSXIdentifier(name) && /^[A-Z_$]/.test(name.name)
}

function componentRef(name: t.JSXOpeningElement['name']): t.Expression {
  if (t.isJSXIdentifier(name)) return t.identifier(name.name)
  if (t.isJSXMemberExpression(name)) return t.memberExpression(componentRef(name.object), t.identifier(name.property.name))
  throw new Error('Invalid component name')
}

function attrName(attr: t.JSXAttribute): string {
  return t.isJSXNamespacedName(attr.name) ? `${attr.name.namespace.name}:${attr.name.name.name}` : attr.name.name
}

/** A literal attribute/child value, as a string, or undefined if dynamic. */
function staticString(expr: t.Node): string | undefined {
  if (t.isStringLiteral(expr)) return expr.value
  if (t.isNumericLiteral(expr)) return String(expr.value)
  if (t.isTemplateLiteral(expr) && expr.expressions.length === 0) return expr.quasis[0].value.cooked ?? ''
  return undefined
}

/** Flatten fragments, clean text, fold literal containers into text, merge adjacent text. */
function normalizeChildren(children: t.JSXElement['children']): Child[] {
  const out: Child[] = []
  const pushText = (value: string) => {
    if (!value) return
    const last = out[out.length - 1]
    if (last?.kind === 'text') last.value += value
    else out.push({ kind: 'text', value })
  }
  for (const c of children) {
    if (t.isJSXText(c)) pushText(cleanJSXText(c.value))
    else if (t.isJSXFragment(c)) for (const n of normalizeChildren(c.children)) n.kind === 'text' ? pushText(n.value) : out.push(n)
    else if (t.isJSXElement(c)) out.push({ kind: 'element', node: c })
    else if (t.isJSXExpressionContainer(c)) {
      if (t.isJSXEmptyExpression(c.expression)) continue
      const s = staticString(c.expression)
      if (s !== undefined) pushText(s)
      else out.push({ kind: 'expr', expr: c.expression, node: c })
    } else if (t.isJSXSpreadChild(c)) {
      throw new Error('Spread children ({...x}) are not supported')
    }
  }
  return out
}

export class TemplateCompiler {
  /** True while compiling markup that will be placed inside SVG content. */
  private svg: boolean

  constructor(
    private ctx: CompileContext,
    private path: NodePath,
  ) {
    this.svg = inSvgContext(path)
  }

  private error(message: string) {
    return codeFrameError(this.path, message)
  }

  /** A compile error located at `node` (markup is parsed as `<>…</>`: line 1 is shifted by 2). */
  private errorAt(node: t.Node, message: string) {
    const err: any = new SyntaxError(message)
    const start = node.loc?.start
    if (start) err.loc = { line: start.line, column: start.line === 1 ? Math.max(0, start.column - 2) : start.column }
    return err
  }

  /** Run `fn` with the SVG context set to `svg` (component children are compiled inline). */
  private withSvg<T>(svg: boolean, fn: () => T): T {
    const prev = this.svg
    this.svg = svg
    try {
      return fn()
    } finally {
      this.svg = prev
    }
  }

  /** Compile a JSX root (element or fragment) to an expression. */
  compile(node: t.JSXElement | t.JSXFragment): t.Expression {
    if (t.isJSXFragment(node)) return this.children(node.children)
    if (isComponent(node)) return this.component(node)
    return this.element(node)
  }

  /** Children as one value: nothing, a single value, or an array. */
  private children(children: t.JSXElement['children']): t.Expression {
    const values = normalizeChildren(children).map((c) => this.childValue(c))
    if (values.length === 0) return t.nullLiteral()
    if (values.length === 1) return values[0]
    return t.arrayExpression(values)
  }

  private childValue(c: Child): t.Expression {
    if (c.kind === 'text') return t.stringLiteral(c.value)
    if (c.kind === 'element') return this.compile(c.node)
    return this.dynamic(c.expr)
  }

  /** A `{…}` child: tracked by `insert`, with conditionals and keyed maps specialised. */
  dynamic(expr: t.Expression): t.Expression {
    const { ctx } = this
    if (t.isCallExpression(expr) && t.isIdentifier(expr.callee, { name: MAP_PLACEHOLDER })) {
      expr.callee = ctx.helper('mapKeyed')
      return expr
    }
    if (t.isStringLiteral(expr) || t.isNumericLiteral(expr) || t.isBooleanLiteral(expr) || t.isNullLiteral(expr)) return expr
    if (t.isLogicalExpression(expr) && (expr.operator === '&&' || expr.operator === '||')) {
      const helper = ctx.helper(expr.operator === '&&' ? 'and' : 'or')
      return t.callExpression(helper, [t.arrowFunctionExpression([], expr.left), this.branch(expr.right)])
    }
    if (t.isConditionalExpression(expr)) {
      return t.callExpression(ctx.helper('cond'), [
        t.arrowFunctionExpression([], expr.test),
        this.branch(expr.consequent),
        this.branch(expr.alternate),
      ])
    }
    return thunk(expr)
  }

  private branch(expr: t.Expression): t.ArrowFunctionExpression {
    const v = this.dynamic(expr)
    return t.isArrowFunctionExpression(v) && v.params.length === 0 ? v : t.arrowFunctionExpression([], v)
  }

  // -------------------------------------------------------------------------
  // components

  /**
   * Attributes as one props expression: an object (getters for dynamic values), or
   * `mergeProps(...)` when there are spreads. `bind:` attributes are skipped (handled by the caller).
   */
  private propsExpression(attributes: t.JSXOpeningElement['attributes'], children?: t.JSXElement['children']): t.Expression {
    const sources: t.Expression[] = []
    let members: (t.ObjectProperty | t.ObjectMethod)[] = []
    const flush = () => {
      if (members.length) sources.push(t.objectExpression(members))
      members = []
    }

    for (const attr of attributes) {
      if (t.isJSXSpreadAttribute(attr)) {
        flush()
        sources.push(t.arrowFunctionExpression([], attr.argument))
        continue
      }
      const name = attrName(attr)
      if (name === 'key' || name.startsWith('bind:')) continue
      const key = t.isValidIdentifier(name) ? t.identifier(name) : t.stringLiteral(name)
      const v = attr.value
      let expr: t.Expression
      if (v == null) expr = t.booleanLiteral(true)
      else if (t.isStringLiteral(v)) expr = v
      else if (t.isJSXExpressionContainer(v)) {
        if (t.isJSXEmptyExpression(v.expression)) continue
        expr = v.expression
      } else expr = this.compile(v as t.JSXElement)

      if (isStaticProp(expr)) members.push(t.objectProperty(key, expr))
      else members.push(t.objectMethod('get', key, [], t.blockStatement([t.returnStatement(expr)])))
    }

    if (children && normalizeChildren(children).length) {
      members.push(t.objectProperty(t.identifier('children'), thunk(this.children(children))))
    }
    flush()
    if (sources.length === 0) return t.objectExpression([])
    if (sources.length === 1 && t.isObjectExpression(sources[0])) return sources[0]
    return t.callExpression(this.ctx.helper('mergeProps'), sources)
  }

  private component(node: t.JSXElement): t.Expression {
    for (const attr of node.openingElement.attributes) {
      if (t.isJSXAttribute(attr) && attrName(attr).startsWith('bind:')) {
        throw this.error(`${attrName(attr)} is only supported on DOM elements`)
      }
    }
    const props = this.propsExpression(node.openingElement.attributes, node.children)
    return t.callExpression(this.ctx.helper('createComponent'), [componentRef(node.openingElement.name), props])
  }

  // -------------------------------------------------------------------------
  // elements

  private element(root: t.JSXElement): t.Expression {
    const { ctx } = this
    const rootId = ctx.uid('el')
    const refs = new Map<string, t.Identifier>([['', rootId]])
    const decls: t.Statement[] = []
    const stmts: t.Statement[] = []
    let html = ''

    /** A variable pointing at the node at `path` (child indexes from the root), walking the clone. */
    const ref = (path: number[]): t.Identifier => {
      const key = path.join(',')
      const existing = refs.get(key)
      if (existing) return existing
      const last = path[path.length - 1]
      const expr =
        last === 0
          ? t.memberExpression(ref(path.slice(0, -1)), t.identifier('firstChild'))
          : t.memberExpression(ref([...path.slice(0, -1), last - 1]), t.identifier('nextSibling'))
      const id = ctx.uid('el')
      decls.push(t.variableDeclaration('const', [t.variableDeclarator(id, expr)]))
      refs.set(key, id)
      return id
    }
    const call = (helper: string, args: t.Expression[]) =>
      stmts.push(t.expressionStatement(t.callExpression(ctx.helper(helper), args)))

    /** `svg`: whether this element is SVG content. */
    const emit = (node: t.JSXElement, path: number[], svg: boolean) => {
      const tag = tagName(node.openingElement.name)
      const childSvg = svg && tag !== 'foreignObject'
      html += `<${tag}`
      let hasClass = false

      // With a spread, every attribute goes through spread() so that later ones win, like in JSX.
      const hasSpread = node.openingElement.attributes.some((a) => t.isJSXSpreadAttribute(a))
      if (hasSpread) {
        const args: t.Expression[] = [ref(path), this.propsExpression(node.openingElement.attributes)]
        if (ctx.scope) args.push(t.stringLiteral(ctx.scope))
        call('spread', args)
      }

      for (const attr of node.openingElement.attributes) {
        if (t.isJSXSpreadAttribute(attr)) continue
        let name = attrName(attr)
        if (hasSpread && !name.startsWith('bind:')) continue
        if (name === 'key') continue
        const v = attr.value
        const expr = t.isJSXExpressionContainer(v) ? (t.isJSXEmptyExpression(v.expression) ? null : v.expression) : v

        if (name.startsWith('bind:')) {
          const prop = name.slice(5)
          if (prop !== 'value' && prop !== 'checked') throw this.error(`Unsupported binding ${name} (use bind:value or bind:checked)`)
          if (!expr || !t.isExpression(expr) || t.isStringLiteral(expr)) throw this.error(`${name} needs a state: ${name}={myState}`)
          call('bind', [ref(path), t.stringLiteral(prop), expr])
          continue
        }
        if (/^on[A-Z]/.test(name)) {
          if (!expr || !t.isExpression(expr)) throw this.error(`${name} needs a function`)
          call('on', [ref(path), t.stringLiteral(name.slice(2).toLowerCase()), handler(expr)])
          continue
        }
        name = ATTR_ALIASES[name] ?? name

        const s = expr == null ? undefined : staticString(expr)
        if (expr == null && v == null) {
          html += ` ${name}` // boolean attribute
        } else if (s !== undefined) {
          if (name === 'class') {
            hasClass = true
            html += ` class="${escapeAttr(ctx.scope ? (s ? `${s} ${ctx.scope}` : ctx.scope) : s)}"`
          } else html += ` ${name}="${escapeAttr(s)}"`
        } else if (expr && t.isExpression(expr)) {
          const args: t.Expression[] = [ref(path), t.stringLiteral(name), t.arrowFunctionExpression([], expr)]
          if (name === 'class') {
            hasClass = true
            if (ctx.scope) {
              html += ` class="${ctx.scope}"`
              args.push(t.stringLiteral(ctx.scope))
            }
          }
          call('attr', args)
        } else if (expr && (t.isJSXElement(expr) || t.isJSXFragment(expr))) {
          throw this.error('JSX is not allowed as a DOM attribute value')
        }
      }
      if (!hasClass && ctx.scope) html += ` class="${ctx.scope}"`
      html += '>'

      const children = normalizeChildren(node.children)
      if (VOID_TAGS.has(tag)) {
        if (children.length) throw this.error(`<${tag}> cannot have children`)
        return
      }
      let index = 0
      children.forEach((child, i) => {
        if (child.kind === 'text') {
          const problem = !childSvg && /[^ \t\n\r\f]/.test(child.value) && tablePlacementError(tag, null)
          if (problem) throw this.errorAt(node, problem)
          html += escapeText(child.value)
          index++
        } else if (child.kind === 'element' && !isComponent(child.node)) {
          const childTag = tagName(child.node.openingElement.name)
          const problem = !childSvg && tablePlacementError(tag, childTag)
          if (problem) throw this.errorAt(child.node, problem)
          emit(child.node, [...path, index], childSvg || childTag === 'svg')
          index++
        } else {
          const value =
            child.kind === 'element' ? this.withSvg(childSvg, () => this.component(child.node)) : this.dynamic(child.expr)
          const parent = ref(path)
          if (i === children.length - 1) {
            call('insert', [parent, value])
          } else {
            html += '<!>'
            call('insert', [parent, value, ref([...path, index])])
            index++
          }
        }
      })
      html += `</${tag}>`
    }

    // An SVG child as a template root (e.g. <circle>) would be parsed as an HTML element, so the
    // runtime parses it inside an <svg> instead.
    const rootTag = tagName(root.openingElement.name)
    const svgRoot = rootTag !== 'svg' && (this.svg || SVG_TAGS.has(rootTag))
    emit(root, [], svgRoot || rootTag === 'svg')
    const tmpl = ctx.template(html, svgRoot)
    if (!stmts.length) return t.callExpression(tmpl, [])
    return t.callExpression(
      t.arrowFunctionExpression(
        [],
        t.blockStatement([
          t.variableDeclaration('const', [t.variableDeclarator(rootId, t.callExpression(tmpl, []))]),
          ...decls,
          ...stmts,
          t.returnStatement(rootId),
        ]),
      ),
      [],
    )
  }
}

/** Props passed as plain values (not getters): literals, functions and plain identifiers. */
function isStaticProp(expr: t.Expression): boolean {
  if (t.isTemplateLiteral(expr)) return expr.expressions.length === 0
  return t.isLiteral(expr) || t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr) || t.isIdentifier(expr)
}

/** Event handlers: function literals and identifiers are passed as-is; anything else is read lazily. */
function handler(expr: t.Expression): t.Expression {
  if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr) || t.isIdentifier(expr)) return expr
  const e = t.identifier('e')
  return t.arrowFunctionExpression([e], t.optionalCallExpression(expr, [e], true))
}

/** Pass 3: replace every JSX root with generated DOM code. */
export function compileTemplates(file: t.File, ctx: CompileContext) {
  traverse.cache.clear()
  traverse(file, {
    'JSXElement|JSXFragment': {
      exit(p) {
        const path = p as NodePath<t.JSXElement | t.JSXFragment>
        const parent = path.parentPath
        if (parent?.isJSXElement() || parent?.isJSXFragment()) return
        const out = new TemplateCompiler(ctx, path).compile(path.node)
        // `x => (() => { … })()` becomes `x => { … }`.
        const fn = thunk(out)
        if (parent?.isArrowFunctionExpression() && path.key === 'body' && fn !== out && t.isBlockStatement(fn.body)) {
          parent.node.body = fn.body
          return
        }
        path.replaceWith(parent?.isJSXAttribute() ? t.jsxExpressionContainer(out) : out)
      },
    },
  })
}

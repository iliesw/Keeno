// Scope component CSS: add the component's hash class to every compound selector.
import postcss, { type Rule } from 'postcss'
import selectorParser from 'postcss-selector-parser'

type SelNode = selectorParser.Selector['nodes'][number]

function isKeyframes(rule: Rule) {
  const parent = rule.parent
  return parent?.type === 'atrule' && /keyframes$/i.test((parent as postcss.AtRule).name)
}

/** Tailwind at-rules whose bodies define global things (utilities, theme, variants), not this component's elements. */
const UNSCOPED_AT_RULES = new Set(['utility', 'theme', 'custom-variant'])

function inUnscopedAtRule(rule: Rule) {
  for (let p: postcss.Node | undefined = rule.parent; p; p = p.parent) {
    if (p.type === 'atrule' && UNSCOPED_AT_RULES.has((p as postcss.AtRule).name.toLowerCase())) return true
  }
  return false
}

function isGlobal(n: SelNode): n is selectorParser.Pseudo {
  return n.type === 'pseudo' && n.value === ':global'
}

function scopeSelector(sel: selectorParser.Selector, scope: string) {
  // Split into compound selectors separated by combinators.
  const compounds: SelNode[][] = [[]]
  for (const n of sel.nodes) {
    if (n.type === 'combinator') compounds.push([])
    else compounds[compounds.length - 1].push(n)
  }

  for (const compound of compounds) {
    if (compound.length === 0) continue
    const globals = compound.filter(isGlobal)
    if (globals.length) {
      // `:global(x)` is left as written: unwrap it and do not scope this compound.
      for (const g of globals) {
        const inner = g.nodes[0]
        if (g.nodes.length !== 1 || !inner) throw new Error(`:global() takes exactly one selector: ${sel.toString()}`)
        g.replaceWith(...(inner.nodes.map((n) => n.clone()) as selectorParser.Pseudo[]))
      }
      continue
    }
    if (compound.every((n) => n.type === 'nesting' || n.type === 'comment')) continue
    const cls = selectorParser.className({ value: scope })
    // Put the class before the first pseudo (`a:hover` -> `a.keeno-x:hover`, `p::before` -> `p.keeno-x::before`).
    const firstPseudo = compound.find((n) => n.type === 'pseudo')
    if (firstPseudo) sel.insertBefore(firstPseudo, cls)
    else sel.insertAfter(compound[compound.length - 1], cls)
  }
}

/** Return `css` with every rule scoped to `.${scope}`. `:global(...)` is unwrapped and not scoped. */
export function scopeStyle(css: string, scope: string, filename?: string): string {
  const root = postcss.parse(css, { from: filename })
  root.walkRules((rule) => {
    if (isKeyframes(rule) || inUnscopedAtRule(rule)) return
    rule.selector = selectorParser((selectors) => {
      selectors.each((sel) => scopeSelector(sel, scope))
    }).processSync(rule.selector)
  })
  return root.toString()
}

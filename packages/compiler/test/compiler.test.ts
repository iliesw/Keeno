import { describe, expect, test } from 'bun:test'
import { compile, scopeStyle, split } from '../src/index'

const js = (source: string, filename = 'src/Test.lx') => compile(source, { filename }).js
const body = (markup: string, script = '') => js(`<script lang="ts">\n${script}\n</script>\n${markup}`)

describe('split', () => {
  test('extracts script, lang, style and markup (offsets preserved)', () => {
    const src = '<script lang="ts">\nconst a = 1\n</script>\n<p>{a}</p>\n<style>p { color: red }</style>\n'
    const r = split(src)
    expect(r.lang).toBe('ts')
    expect(r.script!.content).toBe('\nconst a = 1\n')
    expect(src.slice(r.script!.start, r.script!.start + r.script!.content.length)).toBe(r.script!.content)
    expect(r.style!.content).toBe('p { color: red }')
    expect(r.markup.length).toBe(src.length)
    expect(r.markup.trim()).toBe('<p>{a}</p>')
    expect(r.scriptSource.length).toBe(src.length)
    expect(r.scriptSource.trim()).toBe('const a = 1')
  })

  test('lang defaults to js; HTML comments are dropped from markup', () => {
    const r = split('<!-- hi -->\n<script>let x</script><b/>')
    expect(r.lang).toBe('js')
    expect(r.markup.trim()).toBe('<b/>')
  })

  test('works without a script or style', () => {
    const r = split('<p>hello</p>')
    expect(r.script).toBeNull()
    expect(r.style).toBeNull()
    expect(r.markup).toBe('<p>hello</p>')
  })

  test('rejects two script blocks', () => {
    expect(() => split('<script></script><script></script>')).toThrow(/one <script>/)
  })
})

describe('script rewrite', () => {
  test('a bare state read becomes x.get()', () => {
    const out = body('', 'const count = state(0)\nconsole.log(count + 1)')
    expect(out).toContain('console.log(count.get() + 1)')
    expect(out).toMatchSnapshot()
  })

  test('reserved members are not unwrapped; other members are', () => {
    const out = body(
      '',
      'const todos = state([])\ntodos.set([...todos, 1])\ntodos.onUpdate(() => {})\ntodos.peek()\ntodos.get()\nconst n = todos.length\ntodos?.at(0)',
    )
    expect(out).toContain('todos.set([...todos.get(), 1])')
    expect(out).toContain('todos.onUpdate(')
    expect(out).toContain('todos.peek()')
    expect(out).toContain('todos.get();')
    expect(out).not.toContain('todos.get().get()')
    expect(out).toContain('const n = todos.get().length')
    expect(out).toContain('todos.get()?.at(0)')
    expect(out).toMatchSnapshot()
  })

  test('shorthand properties are expanded', () => {
    expect(body('', 'const a = state(1)\nconst o = { a }')).toContain('a: a.get()')
  })

  test('shadowed names are not rewritten', () => {
    const out = body('', 'const a = state(1)\nfunction f(a) { return a }\nconst g = () => { const a = 2; return a }')
    expect(out).toContain('function f(a) {\n    return a;')
    expect(out).toContain('return a;\n  };')
  })

  test('state reads inside nested functions are rewritten', () => {
    expect(body('', 'const a = state(1)\nfunction f() { return a * 2 }')).toContain('return a.get() * 2')
  })

  test('the deps array of update() is not rewritten', () => {
    const out = body('', 'const a = state(1)\nconst b = state(2)\nupdate(() => console.log(a, b), [a, b])')
    expect(out).toContain('update(() => console.log(a.get(), b.get()), [a, b])')
    expect(out).toMatchSnapshot()
  })

  test('props in the deps array become getters', () => {
    expect(body('', 'const { title } = props()\nupdate(() => {}, [title])')).toContain('[() => $$props.title]')
  })

  test('reassigning a state is a compile error', () => {
    expect(() => body('', 'let a = state(1)\na = 2')).toThrow(/Cannot reassign state "a"; use a.set/)
    expect(() => body('', 'let a = state(1)\na++')).toThrow(/Cannot reassign state/)
  })

  test('props destructuring reads $$props', () => {
    const out = body('<p>{title}</p>', "const { title, onSave, 'aria-label': label, size = 3 } = props()\nonSave(title, label, size)")
    expect(out).not.toContain('props()')
    expect(out).toContain('$$props.onSave($$props.title, $$props["aria-label"], $$props.size ?? 3)')
    expect(out).toContain('() => $$props.title')
    expect(out).toMatchSnapshot()
  })

  test('props() without destructuring is left alone', () => {
    expect(body('', 'const p = props()\nconsole.log(p.title)')).toContain('const p = props()')
  })

  test('reassigning a prop is a compile error', () => {
    expect(() => body('', 'let { a } = props()\na = 1')).toThrow(/Cannot reassign prop "a"/)
  })

  test('rest props are rejected', () => {
    expect(() => body('', 'const { a, ...rest } = props()')).toThrow(/Rest props/)
  })

  test('lux APIs are auto-imported only when used and not imported', () => {
    const out = body('', 'const a = state(0)\ninit(() => {})')
    expect(out).toContain('import { state, init } from "lux"')
    const out2 = js('<script>import { state as s } from "lux"\nconst a = s(0)\nconsole.log(a)</script>')
    expect(out2.match(/from "lux"/g)).toHaveLength(1)
    expect(out2).toContain('console.log(a.get())')
  })

  test('a local function named like an API is not treated as one', () => {
    const out = body('', 'function state(v) { return v }\nconst a = state(1)\nconsole.log(a)')
    expect(out).toContain('console.log(a)')
    expect(out).not.toContain('from "lux"')
  })

  test('imports and types are hoisted; the rest runs per instance', () => {
    const out = js(
      '<script lang="ts">\nimport X from "./X"\ntype T = { a: number }\ninterface I { b: string }\nconst v: T = { a: 1 }\n</script>',
      'src/my-widget.lx',
    )
    expect(out).toMatch(/import X from "\.\/X";\ntype T = \{/)
    expect(out).toContain('export default function MyWidget($$props)')
    expect(out).toContain('const v: T = {')
    expect(out).toMatchSnapshot()
  })

  test('exports are rejected', () => {
    expect(() => js('<script>export const a = 1</script>')).toThrow(/Exports are not supported/)
  })

  test('TypeScript type positions are not rewritten', () => {
    const out = body('', 'const a = state(1)\nlet b: typeof a = a')
    expect(out).toContain('let b: typeof a = a.get()')
  })
})

describe('template codegen', () => {
  test('static markup becomes one hoisted template', () => {
    const out = body('<div><h1 id="t">Hello <b>world</b></h1></div>')
    expect(out).toContain('_$template("<div><h1 id=\\"t\\">Hello <b>world</b></h1></div>")')
    expect(out).toContain('return _tmpl$1();')
    expect(out).toMatchSnapshot()
  })

  test('text expressions use insert with comment markers', () => {
    const out = body('<h1>{title}: {count}</h1>', 'const { title } = props()\nconst count = state(0)')
    expect(out).toContain('"<h1><!>: </h1>"')
    expect(out).toContain('_$insert(_el$1, () => $$props.title, _el$2)')
    expect(out).toContain('_$insert(_el$1, () => count.get())')
    expect(out).toMatchSnapshot()
  })

  test('JSX whitespace rules', () => {
    const out = body('<p>\n  a\n  b {"c"}\n  <i>d</i> e\n</p>')
    expect(out).toContain('"<p>a b c<i>d</i> e</p>"')
  })

  test('text is HTML-escaped and entities decoded', () => {
    expect(body('<p>a &amp; b &lt; {"<c>"}</p>')).toContain('"<p>a &amp; b &lt; &lt;c&gt;</p>"')
  })

  test('void and self-closing elements', () => {
    expect(body('<div><input type="text" /><br/><span/></div>')).toContain(
      '"<div><input type=\\"text\\"><br><span></span></div>"',
    )
  })

  test('dynamic attributes, boolean attributes, aliases', () => {
    const out = body('<label htmlFor="x" className="a" hidden title={t} data-n={1}>x</label>', 'const t = state("")')
    expect(out).toContain('<label for=\\"x\\" class=\\"a\\" hidden data-n=\\"1\\">x</label>')
    expect(out).toContain('_$attr(_el$1, "title", () => t.get())')
    expect(out).toMatchSnapshot()
  })

  test('events become on(); non-literal handlers are read lazily', () => {
    const out = body(
      '<button onClick={() => n.set(n + 1)} onDblClick={reset} onKeyDown={onKey}>+</button>',
      'const n = state(0)\nconst { onKey } = props()\nfunction reset() {}',
    )
    expect(out).toContain('_$on(_el$1, "click", () => n.set(n.get() + 1))')
    expect(out).toContain('_$on(_el$1, "dblclick", reset)')
    expect(out).toContain('_$on(_el$1, "keydown", e => $$props.onKey?.(e))')
    expect(out).toMatchSnapshot()
  })

  test('bind:value and bind:checked pass the state itself', () => {
    const out = body('<input bind:value={name} /><input type="checkbox" bind:checked={done} />', 'const name = state("")\nconst done = state(false)')
    expect(out).toContain('_$bind(_el$1, "value", name)')
    expect(out).toContain('_$bind(_el$2, "checked", done)')
  })

  test('bind on a prop or with an unsupported property is an error', () => {
    expect(() => body('<input bind:value={v} />', 'const { v } = props()')).toThrow(/is a prop/)
    expect(() => body('<input bind:foo={v} />', 'const v = state(1)')).toThrow(/Unsupported binding/)
  })

  test('&&, || and ternaries become and/or/cond', () => {
    const out = body(
      '<div>{count > 5 && <p class="warn">big!</p>}{name || "anon"}{ok ? <b>yes</b> : <i>no</i>}</div>',
      'const count = state(0)\nconst name = state("")\nconst ok = state(true)',
    )
    expect(out).toContain('_$and(() => count.get() > 5, () => _tmpl$1())')
    expect(out).toContain('_$or(() => name.get(), () => "anon")')
    expect(out).toContain('_$cond(() => ok.get(), () => _tmpl$2(), () => _tmpl$3())')
    expect(out).toMatchSnapshot()
  })

  test('.map with a key becomes mapKeyed with the row param read as a state', () => {
    const out = body(
      '<ul>{todos.map(t => <li key={t.id} class={t.done ? "done" : ""}>{t.text}</li>)}</ul>',
      'const todos = state([])',
    )
    expect(out).toContain('_$mapKeyed(() => todos.get(), t => t.id, t => {')
    expect(out).toContain('() => t.get().text')
    expect(out).toContain('() => t.get().done ? "done" : ""')
    expect(out).not.toContain('key')
    expect(out).toMatchSnapshot()
  })

  test('.map with index and destructuring', () => {
    const out = body('<ul>{items.map(({ id, label: l }, i) => <li key={id}>{i}: {l}</li>)}</ul>', 'const items = state([])')
    expect(out).toContain('({\n    id,\n    label: l\n  }, i) => id')
    expect(out).toContain('() => _item.get().label')
    expect(out).toContain('() => i.get()')
    expect(out).toMatchSnapshot()
  })

  test('.map without a key keys by item; maps inside conditionals are detected', () => {
    const out = body('<ul>{show && list.map(x => <li>{x}</li>)}</ul>', 'const show = state(true)\nconst list = state([])')
    expect(out).toContain('_$and(() => show.get(), () => _$mapKeyed(() => list.get(), _item => _item, x =>')
  })

  test('.map without JSX is left alone', () => {
    expect(body('<p>{list.map(x => x * 2).join(",")}</p>', 'const list = state([])')).toContain(
      '() => list.get().map(x => x * 2).join(",")',
    )
  })

  test('components get getters for dynamic props and plain values otherwise', () => {
    const out = body(
      '<Item text={t.text} count={n} label="x" n={1} onSave={(v) => save(v)} handler={save} on />',
      'import Item from "./Item.lx"\nconst t = state({ text: "" })\nconst n = state(0)\nfunction save(v) {}',
    )
    expect(out).toContain('get text() {\n      return t.get().text;')
    expect(out).toContain('get count() {\n      return n.get();')
    expect(out).toContain('label: "x"')
    expect(out).toContain('n: 1')
    expect(out).toContain('onSave: v => save(v)')
    expect(out).toContain('handler: save')
    expect(out).toContain('on: true')
    expect(out).toMatchSnapshot()
  })

  test('component children arrive as a children function', () => {
    const out = body('<Card title="t"><p>{n}</p>text</Card>', 'import Card from "./Card.lx"\nconst n = state(0)')
    expect(out).toContain('children: () => [(() => {')
    expect(out).toMatchSnapshot()
  })

  test('spread props use mergeProps', () => {
    const out = body('<Item {...rest} a={1} />', 'import Item from "./Item.lx"\nconst rest = state({})')
    expect(out).toContain('_$mergeProps(() => rest.get(), {\n    a: 1\n  })')
  })

  test('components inside elements are inserted', () => {
    const out = body('<div><Item /><span /></div>', 'import Item from "./Item.lx"')
    expect(out).toContain('"<div><!><span></span></div>"')
    expect(out).toContain('_$insert(_el$1, _$createComponent(Item, {}), _el$2)')
  })

  test('multiple roots return an array', () => {
    const out = body('<h1>a</h1>\ntext\n{n}\n<Item />', 'import Item from "./Item.lx"\nconst n = state(0)')
    expect(out).toContain('return [_tmpl$1(), "text", () => n.get(), _$createComponent(Item, {})]')
  })

  test('nested element refs are walked before any insert', () => {
    const out = body('<div><p>{a}</p><p><b>{b}</b></p></div>', 'const a = state(1)\nconst b = state(2)')
    expect(out).toMatchSnapshot()
    const firstInsert = out.indexOf('_$insert(')
    expect(out.lastIndexOf('const _el$', firstInsert)).toBeLessThan(firstInsert)
    expect(out.indexOf('const _el$', firstInsert)).toBe(-1)
  })

  test('the plan example compiles', () => {
    const src = planExample()
    const r = compile(src, { filename: 'src/Counter.lx' })
    expect(r.js).toMatchSnapshot()
    expect(r.css).toMatchSnapshot()
  })
})

describe('derived, history members, spread, class arrays', () => {
  test('derived reads unwrap like states and derived is auto-imported', () => {
    const out = body('<p>{total}</p>', 'const n = state(2)\nconst total = derived(() => n * 10)\nconsole.log(total + 1, total.peek())')
    expect(out).toContain('import { state, derived } from "lux"')
    expect(out).toContain('derived(() => n.get() * 10)')
    expect(out).toContain('console.log(total.get() + 1, total.peek())')
    expect(out).toContain('() => total.get()')
  })

  test('derived cannot be reassigned or bound', () => {
    expect(() => body('', 'let d = derived(() => 1)\nd = 2')).toThrow(/Cannot reassign/)
    expect(() => body('<input bind:value={d} />', 'const d = derived(() => "x")')).toThrow(/derived \(read-only\)/)
  })

  test('undo/redo/canUndo/canRedo are reserved members', () => {
    const out = body(
      '<button disabled={!text.canUndo}>undo</button>',
      'const text = state("", { history: 20 })\ntext.undo()\ntext.redo()\nconst r = text.canRedo',
    )
    expect(out).toContain('text.undo()')
    expect(out).toContain('text.redo()')
    expect(out).toContain('const r = text.canRedo')
    expect(out).toContain('() => !text.canUndo')
  })

  test('class arrays and objects go through attr', () => {
    const out = body('<button class={["btn", active && "on", { big }]}>x</button>', 'const active = state(false)\nconst big = true')
    expect(out).toContain('_$attr(_el$1, "class", () => ["btn", active.get() && "on", {')
  })

  test('spread on a DOM element: all attributes go through spread() in order', () => {
    const out = body(
      '<input type="text" {...attrs} placeholder={hint} onInput={log} bind:value={name} />',
      'const attrs = state({})\nconst hint = state("")\nconst name = state("")\nfunction log() {}',
    )
    expect(out).toContain('"<input>"')
    expect(out).toContain('_$spread(_el$1, _$mergeProps({')
    expect(out).toContain('type: "text"')
    expect(out).toContain('}, () => attrs.get(), {')
    expect(out).toContain('get placeholder() {')
    expect(out).toContain('onInput: log')
    expect(out).toContain('_$bind(_el$1, "value", name)')
    expect(out.indexOf('_$spread(')).toBeLessThan(out.indexOf('_$bind('))
    expect(out).toMatchSnapshot()
  })

  test('spread on a scoped element passes the scope class', () => {
    const r = compile('<script>const a = state({})</script><div {...a} /><style>div {}</style>', { filename: 'src/S.lx' })
    expect(r.js).toContain(`_$spread(_el$1, _$mergeProps(() => a.get()), "${r.scope}")`)
    expect(r.js).toContain(`"<div class=\\"${r.scope}\\"></div>"`)
  })
})

describe('hmr', () => {
  test('hmrId exports a hot wrapper instead of the bare component', () => {
    const out = compile('<p />', { filename: 'src/A.lx', hmrId: 'src/A.lx' }).js
    expect(out).toContain('hot as _$hot')
    expect(out).toContain('function A($$props) {')
    expect(out).toContain('export default _$hot(A, "src/A.lx");')
    expect(out).not.toContain('export default function')
  })
})

describe('scoped styles', () => {
  const s = (css: string) => scopeStyle(css, 'lux-x').trim()

  test('every compound selector gets the scope class', () => {
    expect(s('h1 { color: teal }')).toBe('h1.lux-x { color: teal }')
    expect(s('ul > li.done + p, .a .b {}')).toBe('ul.lux-x > li.done.lux-x + p.lux-x, .a.lux-x .b.lux-x {}')
  })

  test('the class goes before pseudo-classes and pseudo-elements', () => {
    expect(s('a:hover::before {}')).toBe('a.lux-x:hover::before {}')
    expect(s(':not(.x) {}')).toBe('.lux-x:not(.x) {}')
  })

  test(':global() is unwrapped and left unscoped', () => {
    expect(s(':global(body) { margin: 0 }')).toBe('body { margin: 0 }')
    expect(s(':global(.dark) h1 {}')).toBe('.dark h1.lux-x {}')
    expect(s('div :global(p.x) {}')).toBe('div.lux-x p.x {}')
  })

  test('at-rules: @media is scoped, @keyframes steps are not', () => {
    expect(s('@media (min-width: 1px) { p { x: y } }')).toBe('@media (min-width: 1px) { p.lux-x { x: y } }')
    expect(s('@keyframes k { from { a: b } 50% { a: c } }')).toBe('@keyframes k { from { a: b } 50% { a: c } }')
  })

  test('compile() returns scoped css and adds the class to every element', () => {
    const r = compile('<div><p>x</p></div><style>p { color: red }</style>', { filename: 'src/A.lx' })
    expect(r.css.trim()).toBe(`p.${r.scope} { color: red }`)
    expect(r.js).toContain(`<div class=\\"${r.scope}\\"><p class=\\"${r.scope}\\">x</p></div>`)
  })

  test('static and dynamic class keep the scope class', () => {
    const r = compile('<script>const c = state("a")</script><p class="x" /><i class={c} /><style>p {}</style>', {
      filename: 'src/A.lx',
    })
    expect(r.js).toContain(`class=\\"x ${r.scope}\\"`)
    expect(r.js).toContain(`_$attr(_el$2, "class", () => c.get(), "${r.scope}")`)
  })

  test('no style block: no scope class in the markup', () => {
    expect(compile('<p />', { filename: 'src/A.lx' }).js).toContain('"<p></p>"')
  })

  test('the scope hash depends on the file path only', () => {
    const a = compile('<p/>', { filename: 'src/A.lx' }).scope
    expect(compile('<b/>', { filename: 'src\\A.lx' }).scope).toBe(a)
    expect(compile('<p/>', { filename: 'src/B.lx' }).scope).not.toBe(a)
    expect(a).toMatch(/^lux-[0-9a-f]{8}$/)
  })
})

function planExample() {
  return `<!-- Counter.lx -->
<script lang="ts">
  import Item from './Item.lx'
  const { title, onSave } = props()
  const count = state(0)
  const todos = state<{ id: number; text: string }[]>([])
  const name  = state('')

  init(() => console.log('mounted'))
  destroy(() => console.log('bye'))
  update(() => localStorage.setItem('n', String(count)))        // auto-tracked
  update(() => console.log('name or count changed'), [name, count]) // explicit deps
  count.onUpdate((old, next) => console.log(old, '->', next))

  function add() {
    todos.set([...todos, { id: Date.now(), text: name }])
    name.set('')
  }
</script>

<h1>{title}: {count}</h1>
<button onClick={() => count.set(count + 1)}>+1</button>
<input bind:value={name} />
{count > 5 && <p class="warn">big!</p>}
<ul>{todos.map(t => <Item key={t.id} text={t.text} />)}</ul>
<button onClick={() => onSave(count)}>save</button>

<style>
  h1 { color: teal }          /* scoped to this component */
  :global(body) { margin: 0 } /* escape hatch */
</style>
`
}

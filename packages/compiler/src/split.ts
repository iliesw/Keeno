// Split an `.kn` file into its <script>, <style> and markup parts.

export interface Block {
  /** Text between the opening and closing tags. */
  content: string
  /** Offset of `content` in the original source. */
  start: number
  attrs: Record<string, string>
}

export interface SplitResult {
  script: Block | null
  style: Block | null
  lang: 'ts' | 'js'
  /**
   * The markup, with the script and style blocks (and HTML comments) blanked out so that
   * offsets, lines and columns still match the original source.
   */
  markup: string
  /** The source with everything except the script content blanked out (same offsets). */
  scriptSource: string
  /** `[start, end)` ranges of the source that are not markup: whole script/style blocks and HTML comments. */
  ranges: [number, number][]
}

export class KeenoSplitError extends Error {
  constructor(
    message: string,
    public offset: number,
  ) {
    super(message)
  }
}

/** Opening `<script>`/`<style>` tags, and `<svg>` tags to know when we are inside one. */
const TAG_RE = /<(\/?)(script|style|svg)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi
const ATTR_RE = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
/** `type` values of a `<script>` that is the component's code (any other type is page content). */
const SCRIPT_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'ts', 'text/typescript'])

/**
 * Offset of the `</script>` that ends the script starting at `i`, skipping strings, template
 * literals and comments, where `</script>` is just text.
 */
function scriptEnd(src: string, i: number): number {
  const closes = (at: number) => /^<\/script\s*>/i.test(src.slice(at, at + 20))
  // Brace depth of each `${…}` we are in, innermost last.
  const exprs: number[] = []
  const skipTemplate = (at: number): number => {
    for (let j = at + 1; j < src.length; j++) {
      const c = src[j]
      if (c === '\\') j++
      else if (c === '`') return j + 1
      else if (c === '$' && src[j + 1] === '{') {
        exprs.push(0)
        return j + 2
      }
    }
    return src.length
  }
  while (i < src.length) {
    const c = src[i]
    if (c === '<' && closes(i)) return i
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i)
      i = nl < 0 ? src.length : nl
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end < 0 ? src.length : end + 2
    } else if (c === '"' || c === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      i = j + 1
    } else if (c === '`') {
      i = skipTemplate(i)
    } else if (exprs.length && c === '{') {
      exprs[exprs.length - 1]!++
      i++
    } else if (exprs.length && c === '}') {
      if (exprs[exprs.length - 1]!-- === 0) {
        exprs.pop()
        i = skipTemplate(i)
      } else i++
    } else i++
  }
  return -1
}

/** Replace every character except newlines with a space. */
export function blank(s: string): string {
  return s.replace(/[^\r\n]/g, ' ')
}

function parseAttrs(s: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const m of s.matchAll(ATTR_RE)) attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
  return attrs
}

export function split(source: string): SplitResult {
  let script: Block | null = null
  let style: Block | null = null
  const ranges: [number, number][] = []

  // `<style>` inside an inline `<svg>`, and `<script>`s with a data type (JSON-LD…), are markup.
  let svgDepth = 0
  TAG_RE.lastIndex = 0
  for (let m: RegExpExecArray | null; (m = TAG_RE.exec(source)); ) {
    const closing = m[1] === '/'
    const tag = m[2].toLowerCase() as 'script' | 'style' | 'svg'
    if (tag === 'svg') {
      if (closing) svgDepth = Math.max(0, svgDepth - 1)
      else if (!m[3].trimEnd().endsWith('/')) svgDepth++
      continue
    }
    if (closing || svgDepth > 0) continue
    const attrs = parseAttrs(m[3])
    if (tag === 'script' && !SCRIPT_TYPES.has((attrs.type ?? '').toLowerCase())) continue
    const start = m.index + m[0].length
    let end: number
    let after: number
    if (tag === 'script') {
      end = scriptEnd(source, start)
      if (end < 0) throw new KeenoSplitError('Unclosed <script> block', m.index)
      after = source.indexOf('>', end) + 1
    } else {
      const close = /<\/style\s*>/gi
      close.lastIndex = start
      const c = close.exec(source)
      if (!c) throw new KeenoSplitError('Unclosed <style> block', m.index)
      end = c.index
      after = c.index + c[0].length
    }
    const block: Block = { content: source.slice(start, end), start, attrs }
    if (tag === 'script') {
      if (script) throw new KeenoSplitError('An .kn file can only have one <script> block', m.index)
      script = block
    } else {
      if (style) throw new KeenoSplitError('An .kn file can only have one <style> block', m.index)
      style = block
    }
    ranges.push([m.index, after])
    TAG_RE.lastIndex = after
  }

  let markup = ''
  let last = 0
  for (const [a, b] of ranges) {
    markup += source.slice(last, a) + blank(source.slice(a, b))
    last = b
  }
  markup += source.slice(last)
  markup = markup.replace(/<!--[\s\S]*?-->/g, (m, offset: number) => {
    ranges.push([offset, offset + m.length])
    return blank(m)
  })
  ranges.sort((a, b) => a[0] - b[0])

  let scriptSource = blank(source)
  if (script) {
    const s = script as Block
    scriptSource = scriptSource.slice(0, s.start) + s.content + scriptSource.slice(s.start + s.content.length)
  }

  const lang = (script as Block | null)?.attrs.lang
  return { script, style, lang: lang === 'ts' || lang === 'typescript' ? 'ts' : 'js', markup, scriptSource, ranges }
}

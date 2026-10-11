// Split an `.lx` file into its <script>, <style> and markup parts.

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

export class LuxSplitError extends Error {
  constructor(
    message: string,
    public offset: number,
  ) {
    super(message)
  }
}

const BLOCK_RE = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi
const ATTR_RE = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

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

  for (const m of source.matchAll(BLOCK_RE)) {
    const tag = m[1].toLowerCase() as 'script' | 'style'
    const start = m.index! + m[0].indexOf('>') + 1
    const block: Block = { content: m[3], start, attrs: parseAttrs(m[2]) }
    if (tag === 'script') {
      if (script) throw new LuxSplitError('An .lx file can only have one <script> block', m.index!)
      script = block
    } else {
      if (style) throw new LuxSplitError('An .lx file can only have one <style> block', m.index!)
      style = block
    }
    ranges.push([m.index!, m.index! + m[0].length])
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

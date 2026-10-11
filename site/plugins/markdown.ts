// Vite plugin: turns `.md` imports into `{ title, html, headings, raw }` modules at build time.
// Markdown is parsed with marked, code is highlighted with highlight.js and wrapped in the
// same code-block chrome on the server and the client, so pages ship no parser.
import hljs from 'highlight.js'
import { Marked, type Tokens } from 'marked'
import type { Plugin } from 'vite'

export interface Heading {
  id: string
  text: string
  depth: number
}

const REPO = 'https://github.com/iliesw/Lux'

const LANG_ALIASES: Record<string, string> = {
  lx: 'html',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  sh: 'bash',
  shell: 'bash',
  console: 'bash',
  jsonc: 'json',
  md: 'markdown',
}

const ICONS: Record<string, string> = {
  html: 'html',
  xml: 'xml',
  typescript: 'typescript',
  javascript: 'javascript',
  bash: 'terminal',
  json: 'json',
  css: 'css',
  markdown: 'markdown',
}

export const COPY_ICON =
  '<svg class="i-copy" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
export const CHECK_ICON =
  '<svg class="i-check" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`'"()<>{}[\]@/.,:;!?*+=|\\]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/** Render a fenced code block (`info` is e.g. `html App.lx`) to the site's code-block markup. */
export function renderCode(code: string, info = ''): string {
  const [rawLang = '', ...rest] = info.trim().split(/\s+/)
  const filename = rest.join(' ')
  const fileExt = filename.match(/\.(\w+)$/)?.[1]
  const lang = LANG_ALIASES[rawLang] ?? rawLang
  let highlighted: string
  try {
    highlighted = lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : escapeHtml(code)
  } catch {
    highlighted = escapeHtml(code)
  }
  const lines = code.split('\n').length
  const icon = fileExt === 'lx' ? 'lx' : ICONS[LANG_ALIASES[fileExt ?? ''] ?? fileExt ?? ''] ?? ICONS[lang] ?? 'terminal'
  const label = filename || rawLang || 'text'
  const copy = `<button type="button" class="code-copy" data-copy aria-label="Copy code">${COPY_ICON}${CHECK_ICON}</button>`
  const long = lines > 2 || !!filename
  const head = long
    ? `<div class="code-head"><div class="code-lang"><img src="/icons/${icon}.svg" width="20" height="20" alt=""><img src="/icons/${icon}.svg" width="20" height="20" alt="" class="code-glow"><span>${escapeHtml(label)}</span></div>${copy}</div>`
    : ''
  const gutter = lines > 2 ? `<div class="code-lines" aria-hidden="true">${Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</div>` : ''
  return `<div class="code-block${long ? '' : ' code-short'}">${head}<div class="code-body">${long ? '' : copy}${gutter}<pre><code class="hljs language-${escapeHtml(lang || 'text')}">${highlighted}</code></pre></div><div class="code-flash"></div></div>`
}

/** Point links between docs (`routing.md#x`) at site routes and repo files at GitHub. */
function rewriteHref(href: string): string {
  if (/^(https?:|mailto:|#)/.test(href)) return href
  const doc = href.match(/^(?:\.\/|docs\/)?([\w-]+)\.md(#.*)?$/)
  if (doc) return `/docs/${doc[1]}${doc[2] ?? ''}`
  const clean = href.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '')
  return `${REPO}/tree/main/${clean}`
}

export function renderMarkdown(raw: string) {
  const headings: Heading[] = []
  const used = new Map<string, number>()
  let title = ''
  const md = new Marked({ gfm: true })
  md.use({
    renderer: {
      heading(this: any, { tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens)
        const text = stripTags(inner)
        if (depth === 1) {
          if (!title) title = text
          return `<h1>${inner}</h1>\n`
        }
        let id = slugify(text)
        const n = used.get(id) ?? 0
        used.set(id, n + 1)
        if (n) id += `-${n}`
        if (depth <= 3) headings.push({ id, text, depth })
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`
      },
      code({ text, lang }: Tokens.Code) {
        return renderCode(text, lang ?? '')
      },
      link(this: any, { href, title: t, tokens }: Tokens.Link) {
        const url = rewriteHref(href)
        const external = /^https?:/.test(url)
        const attrs = external ? ' target="_blank" rel="noreferrer"' : ''
        return `<a href="${escapeHtml(url)}"${t ? ` title="${escapeHtml(t)}"` : ''}${attrs}>${this.parser.parseInline(tokens)}</a>`
      },
      blockquote(this: any, { tokens }: Tokens.Blockquote) {
        return `<div class="callout">${this.parser.parse(tokens)}</div>\n`
      },
    },
  })
  const html = (md.parse(raw) as string)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
  return { title, html, headings }
}

export default function markdown(): Plugin {
  return {
    name: 'lux-docs-markdown',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0].endsWith('.md')) return
      const { title, html, headings } = renderMarkdown(code)
      return {
        code: `export default ${JSON.stringify({ title, html, headings, raw: code })}`,
        map: null,
      }
    },
  }
}

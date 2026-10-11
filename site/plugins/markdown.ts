// Vite plugin: turns `.md` imports into `{ title, html, headings, raw }` modules at build time.
// Markdown is parsed with marked, code is highlighted with highlight.js and wrapped in the
// same code-block chrome on the server and the client, so pages ship no parser.
//
// It also serves `?highlight` (a source file and its highlighted code block), `?compiled` (what
// the Lux compiler emits for a component) and `?search` (a page's sections, for the search box).
import { compile } from '@inflector/lux-compiler'
import hljs from 'highlight.js'
import { Marked, type Tokens } from 'marked'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { transform as sucrase } from 'sucrase'
import type { Plugin } from 'vite'

export interface Heading {
  id: string
  text: string
  depth: number
}

export interface Section {
  id: string
  heading: string
  text: string
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
const PLAY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>'

const CALLOUT_ICONS: Record<string, string> = {
  note: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  tip: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  important: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  caution: '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.31 2a2 2 0 0 1 1.41.59l4.7 4.7A2 2 0 0 1 22 8.69v6.62a2 2 0 0 1-.59 1.41l-4.7 4.7a2 2 0 0 1-1.41.59H8.69a2 2 0 0 1-1.41-.59l-4.7-4.7A2 2 0 0 1 2 15.31V8.69a2 2 0 0 1 .59-1.41l4.7-4.7A2 2 0 0 1 8.69 2z"/>',
}

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

// ---------------------------------------------------------------------------------------------
// Code blocks

export const PMS = ['bun', 'npm', 'pnpm', 'yarn'] as const
type PM = (typeof PMS)[number]

/** `bun add -d vite` → the same command for another package manager. */
function convertCommand(line: string, pm: PM): string {
  if (pm === 'bun') return line
  let m: RegExpMatchArray | null
  if ((m = line.match(/^bun add(?: (?:-d|--dev))? (.+)$/))) {
    const dev = /^bun add (?:-d|--dev) /.test(line) ? ' -D' : ''
    return `${pm === 'npm' ? 'npm install' : `${pm} add`}${dev} ${m[1]}`
  }
  if ((m = line.match(/^bunx (?:--bun )?(.+)$/))) return `${pm === 'npm' ? 'npx' : `${pm} dlx`} ${m[1]}`
  if (line === 'bun install') return `${pm} install`
  return line
}

const isInstallBlock = (code: string, lang: string) =>
  lang === 'bash' &&
  code
    .trim()
    .split('\n')
    .every((l) => /^(bun add\b|bunx\b|bun install$)/.test(l.trim()))

/** Install commands as tabs, one per package manager (the choice is remembered site-wide). */
function renderInstallTabs(code: string): string {
  const icon: Record<PM, string> = { bun: 'bun', npm: 'npm', pnpm: 'pnpm', yarn: 'yarn' }
  const tabs = PMS.map(
    (pm) =>
      `<button type="button" role="tab" class="pm-tab" data-pm="${pm}"><img src="/icons/${icon[pm]}.svg" width="14" height="14" alt="">${pm}</button>`,
  ).join('')
  const panes = PMS.map((pm) => {
    const converted = code
      .trim()
      .split('\n')
      .map((l) => convertCommand(l.trim(), pm))
      .join('\n')
    return `<div class="pm-pane" data-pm-pane="${pm}">${renderCode(converted, 'bash', { bare: true })}</div>`
  }).join('')
  return `<div class="pm-block"><div class="pm-tabs" role="tablist">${tabs}</div>${panes}</div>`
}

/** Render a fenced code block (`info` is e.g. `html App.lx`) to the site's code-block markup. */
export function renderCode(code: string, info = '', options: { bare?: boolean } = {}): string {
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
  // A self-contained component (no imports of sibling files) can be opened in the playground.
  const playable = fileExt === 'lx' && !/from\s+['"]\.\.?\//.test(code)
  const play = playable
    ? `<button type="button" class="code-play" data-playground title="Open in the playground">${PLAY_ICON}<span>Try it</span></button>`
    : ''
  const long = !options.bare && (lines > 2 || !!filename)
  const head = long
    ? `<div class="code-head"><div class="code-lang"><img src="/icons/${icon}.svg" width="20" height="20" alt=""><img src="/icons/${icon}.svg" width="20" height="20" alt="" class="code-glow"><span>${escapeHtml(label)}</span></div><div class="code-actions">${play}${copy}</div></div>`
    : ''
  const gutter = lines > 2 ? `<div class="code-lines" aria-hidden="true">${Array.from({ length: lines }, (_, i) => i + 1).join('\n')}</div>` : ''
  return `<div class="code-block${long ? '' : ' code-short'}"${playable ? ` data-file="${escapeHtml(filename)}"` : ''}>${head}<div class="code-body">${long ? '' : copy}${gutter}<pre><code class="hljs language-${escapeHtml(lang || 'text')}">${highlighted}</code></pre></div><div class="code-flash"></div></div>`
}

/** Point links between docs (`routing.md#x`) at site routes and repo files at GitHub. */
function rewriteHref(href: string): string {
  if (/^(https?:|mailto:|#|\/)/.test(href)) return href
  const doc = href.match(/^(?:\.\/|docs\/)?([\w-]+)\.md(#.*)?$/)
  if (doc) return `/docs/${doc[1]}${doc[2] ?? ''}`
  const clean = href.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '')
  return `${REPO}/tree/main/${clean}`
}

// ---------------------------------------------------------------------------------------------
// Markdown

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
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${depth}>\n`
      },
      code({ text, lang }: Tokens.Code) {
        const rawLang = (lang ?? '').trim().split(/\s+/)[0]
        if (isInstallBlock(text, LANG_ALIASES[rawLang] ?? rawLang)) return renderInstallTabs(text)
        return renderCode(text, lang ?? '')
      },
      link(this: any, { href, title: t, tokens }: Tokens.Link) {
        const url = rewriteHref(href)
        const external = /^https?:/.test(url)
        const attrs = external ? ' target="_blank" rel="noreferrer"' : ''
        return `<a href="${escapeHtml(url)}"${t ? ` title="${escapeHtml(t)}"` : ''}${attrs}>${this.parser.parseInline(tokens)}</a>`
      },
      blockquote(this: any, { tokens }: Tokens.Blockquote) {
        // GitHub alerts: `> [!NOTE]`, `> [!TIP]`, `> [!WARNING]`...
        let html: string = this.parser.parse(tokens)
        let kind = 'note'
        const m = html.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i)
        if (m) {
          kind = m[1].toLowerCase()
          html = '<p>' + html.slice(m[0].length)
        }
        const label = kind[0].toUpperCase() + kind.slice(1)
        const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${CALLOUT_ICONS[kind]}</svg>`
        return `<div class="callout callout-${kind}"><p class="callout-title">${icon}${label}</p>${html}</div>\n`
      },
    },
  })
  const html = (md.parse(raw) as string)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
  return { title, html, headings }
}

/** A page split at its headings, as plain text, for the search box. */
export function searchSections(raw: string): { title: string; sections: Section[] } {
  const { title } = renderMarkdown(raw)
  const sections: Section[] = []
  const used = new Map<string, number>()
  let current: Section = { id: '', heading: title, text: '' }
  let inCode = false
  for (const line of raw.split('\n')) {
    if (line.startsWith('```')) {
      inCode = !inCode
      continue
    }
    const h = !inCode && line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      if (h[1].length === 1) continue
      sections.push(current)
      const text = stripTags(new Marked().parseInline(h[2]) as string)
      let id = slugify(text)
      const n = used.get(id) ?? 0
      used.set(id, n + 1)
      if (n) id += `-${n}`
      current = { id, heading: text, text: '' }
      continue
    }
    if (inCode || /^\s*\|?[\s:|-]+\|?\s*$/.test(line)) continue
    current.text += ' ' + line.replace(/[`*_>|#[\]]|\(([^)]*\.md[^)]*|https?:[^)]*)\)/g, '').trim()
  }
  sections.push(current)
  for (const s of sections) s.text = s.text.replace(/\s+/g, ' ').trim().slice(0, 400)
  return { title, sections: sections.filter((s) => s.text || s.id) }
}

/** Date of the last commit that touched `file` (YYYY-MM-DD), or '' outside a git checkout. */
function lastUpdated(file: string): string {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', path.basename(file)], { cwd: path.dirname(file), encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const EXT_LANG: Record<string, string> = { lx: 'html', ts: 'ts', js: 'js', css: 'css', json: 'json' }

/** What the Lux compiler emits for a component, with types stripped. */
export function compiledOutput(source: string, filename: string): string {
  const out = compile(source, { filename })
  return sucrase(out.js, { transforms: ['typescript'], disableESTransforms: true, keepUnusedImports: true }).code.trim()
}

export default function markdown(): Plugin {
  return {
    name: 'lux-docs-markdown',
    enforce: 'pre',
    load(id) {
      const [file, query = ''] = id.split('?', 2)
      const mode = query.split('&').find((q) => q === 'highlight' || q === 'compiled' || q === 'search')
      if (!mode) return
      this.addWatchFile(file)
      const name = path.basename(file)
      const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
      if (mode === 'search') return `export default ${JSON.stringify(searchSections(raw))}`
      if (mode === 'compiled') {
        const js = compiledOutput(raw, name)
        return `export default ${JSON.stringify({ raw: js, html: renderCode(js, `js ${name.replace(/\.lx$/, '.js')}`) })}`
      }
      const lang = EXT_LANG[name.split('.').pop() ?? ''] ?? ''
      return `export default ${JSON.stringify({ raw, html: renderCode(raw.trimEnd(), `${lang} ${name}`) })}`
    },
    transform(code, id) {
      const [file, query] = id.split('?', 2)
      if (!file.endsWith('.md') || query) return
      const { title, html, headings } = renderMarkdown(code)
      const updated = lastUpdated(file)
      return {
        code: `export default ${JSON.stringify({ title, html, headings, raw: code, updated })}`,
        map: null,
      }
    },
  }
}

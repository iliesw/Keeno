// Page titles and descriptions, shared by the pages' <Meta> tags.
export const SITE = 'Keeno'
export const DESCRIPTION =
  'Keeno is a compiled, signal-based frontend framework: HTML-first .kn components with fine-grained updates and no virtual DOM.'

/** The first prose line of a markdown page, as plain text: no code, headings, lists or tables. */
export function firstParagraph(md: string): string | undefined {
  let fenced = false
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced || !line || /^([#|><]|[-*+] |\d+\. |---)/.test(line)) continue
    const text = line
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`]/g, '')
      .trim()
    if (!text) continue
    return text.length > 160 ? text.slice(0, 157).replace(/\s+\S*$/, '') + '…' : text
  }
}

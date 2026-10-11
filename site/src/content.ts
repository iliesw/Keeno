import { navigate } from '@inflector/keeno-router'

/**
 * Click handler for rendered markdown (set with `innerHTML`): copy buttons of code blocks,
 * package-manager tabs, "Try it" buttons that open a component in the playground, and links to
 * other pages, which navigate without reloading.
 */
export function onContentClick(e: MouseEvent) {
  const target = e.target as Element
  const copy = target.closest('[data-copy]')
  if (copy) {
    const block = copy.closest<HTMLElement>('.code-block')!
    navigator.clipboard?.writeText(block.querySelector('pre code')?.textContent ?? '')
    block.classList.remove('copied')
    void block.offsetWidth // restart the animation
    block.classList.add('copied')
    setTimeout(() => block.classList.remove('copied'), 1000)
    return
  }
  const pm = target.closest<HTMLElement>('.pm-tab[data-pm]')
  if (pm?.dataset.pm) {
    // Remembered across pages and visits; index.html applies it before the first paint.
    document.documentElement.dataset.pm = pm.dataset.pm
    try {
      localStorage.setItem('keeno-pm', pm.dataset.pm)
    } catch {}
    return
  }
  const play = target.closest('[data-playground]')
  if (play) {
    const code = play.closest('.code-block')?.querySelector('pre code')?.textContent ?? ''
    import('./playground/share').then(async ({ playgroundUrl }) => navigate(await playgroundUrl({ files: [{ name: 'App.kn', code }] })))
    return
  }
  const a = target.closest('a')
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin) return
  if (url.pathname === location.pathname && url.hash) {
    // Heading anchors: also copy the link to the section.
    if (a.classList.contains('anchor')) navigator.clipboard?.writeText(url.href).catch(() => {})
    return
  }
  e.preventDefault()
  navigate(url.pathname + url.search + url.hash)
}

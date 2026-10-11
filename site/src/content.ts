import { navigate } from '@inflector/lux-router'

/**
 * Click handler for rendered markdown (set with `innerHTML`): copy buttons of code blocks, and
 * links to other pages, which navigate without reloading.
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
  const a = target.closest('a')
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return
  e.preventDefault()
  navigate(url.pathname + url.search + url.hash)
}

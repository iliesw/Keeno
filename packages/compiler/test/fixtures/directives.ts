import type { Directive } from '@inflector/keeno'

export const log: string[] = []

export const label: Directive<HTMLElement, string> = (el, text) => {
  el.setAttribute('data-label', text)
  log.push(`label ${text}`)
  return () => log.push(`unlabel ${text}`)
}

export const clickOutside: Directive<HTMLElement, () => void> = (el, onOutside) => {
  const handler = (e: Event) => !el.contains(e.target as Node) && onOutside()
  document.addEventListener('click', handler, true)
  return () => document.removeEventListener('click', handler, true)
}

import type { Directive } from '@inflector/keeno'

export const tooltip: Directive<HTMLElement, { text: string }> = (el, { text }) => {
  el.title = text
}
export const autosize: Directive<HTMLTextAreaElement> = (el) => {
  el.style.height = `${el.scrollHeight}px`
}
export const autofocus: Directive = (el) => el.focus()

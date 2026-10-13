// Reusable DOM behaviors: each is a plain function, used as `use:name={value}` in markup.
import type { Directive } from '@inflector/keeno'

/** A small tooltip that follows the element. Re-created when its text changes. */
export const tooltip: Directive<HTMLElement, string> = (el, text) => {
  const tip = document.createElement('div')
  tip.className = 'kn-tip'
  tip.textContent = text
  tip.style.cssText =
    'position:fixed;z-index:50;padding:4px 8px;border-radius:6px;font-size:12px;pointer-events:none;' +
    'background:var(--fg);color:var(--bg);transform:translate(-50%,-100%)'
  const show = () => {
    const r = el.getBoundingClientRect()
    tip.style.left = `${r.left + r.width / 2}px`
    tip.style.top = `${r.top - 6}px`
    document.body.append(tip)
  }
  const hide = () => tip.remove()
  el.addEventListener('pointerenter', show)
  el.addEventListener('pointerleave', hide)
  el.addEventListener('focus', show)
  el.addEventListener('blur', hide)
  return () => {
    hide()
    el.removeEventListener('pointerenter', show)
    el.removeEventListener('pointerleave', hide)
    el.removeEventListener('focus', show)
    el.removeEventListener('blur', hide)
  }
}

/** Calls `onOutside` for presses outside the element (closing menus and popovers). */
export const clickOutside: Directive<HTMLElement, () => void> = (el, onOutside) => {
  const handler = (e: PointerEvent) => !el.contains(e.target as Node) && onOutside()
  document.addEventListener('pointerdown', handler, true)
  return () => document.removeEventListener('pointerdown', handler, true)
}

/** Grows a textarea with its content. */
export const autosize: Directive<HTMLTextAreaElement> = (el) => {
  const fit = () => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  fit()
  el.addEventListener('input', fit)
  return () => el.removeEventListener('input', fit)
}

/** Focuses the element when it appears. */
export const autofocus: Directive = (el) => el.focus()

/** Calls `onChange(visible)` as the element enters and leaves the viewport. */
export const inView: Directive<Element, (visible: boolean) => void> = (el, onChange) => {
  const io = new IntersectionObserver(([entry]) => onChange(entry!.isIntersecting))
  io.observe(el)
  return () => io.disconnect()
}

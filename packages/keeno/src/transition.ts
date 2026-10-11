// <Transition>: CSS-class (or JS hook) enter/leave animations for elements added and removed inside it.
import type { Children } from './component'
import { collect, isServer, resolve } from './dom'
import { onCleanup } from './signal'
import { State } from './state'

export interface TransitionProps {
  /**
   * Class prefix (default `keeno`). Entering elements get `{name}-enter-from` and
   * `{name}-enter-active`, then `{name}-enter-to`; leaving ones the same with `leave`.
   */
  name?: string
  /** Also animate the elements present on first render (default false). */
  appear?: boolean
  /** JavaScript enter animation instead of the CSS classes. Call `done` when finished. */
  onEnter?: (el: Element, done: () => void) => void
  /** JavaScript leave animation instead of the CSS classes. The element is removed on `done`. */
  onLeave?: (el: Element, done: () => void) => void
  children?: Children
}

const nextFrame = (fn: () => void) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(fn))
  else setTimeout(fn, 16)
}

function toMs(s: string): number {
  return s.endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000 || 0
}

/** The longest transition or animation (duration + delay) on `el`, in ms. */
function duration(el: Element): number {
  if (typeof getComputedStyle !== 'function') return 0
  const cs = getComputedStyle(el)
  const longest = (durations: string, delays: string) => {
    const d = (durations || '').split(',')
    const l = (delays || '').split(',')
    return Math.max(0, ...d.map((x, i) => toMs(x.trim()) + toMs((l[i % l.length] || '0s').trim())))
  }
  return Math.max(longest(cs.transitionDuration, cs.transitionDelay), longest(cs.animationDuration, cs.animationDelay))
}

type Phase = 'enter' | 'leave'

function clearClasses(el: Element, name: string, phase: Phase) {
  el.classList.remove(`${name}-${phase}-active`, `${name}-${phase}-from`, `${name}-${phase}-to`)
  if (el.getAttribute('class') === '') el.removeAttribute('class')
}

/** Run one phase on `el`; returns a function that cancels it. */
function animate(el: Element, name: string, phase: Phase, hook: TransitionProps['onEnter'], done: () => void): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const finish = () => {
    if (cancelled) return
    cancelled = true
    clearTimeout(timer)
    clearClasses(el, name, phase)
    done()
  }
  if (hook) {
    hook(el, finish)
    return () => {
      cancelled = true
    }
  }
  el.classList.add(`${name}-${phase}-from`, `${name}-${phase}-active`)
  nextFrame(() => {
    if (cancelled) return
    el.classList.remove(`${name}-${phase}-from`)
    el.classList.add(`${name}-${phase}-to`)
    const ms = duration(el)
    if (ms > 0) timer = setTimeout(finish, ms)
    else finish()
  })
  return () => {
    cancelled = true
    clearTimeout(timer)
    clearClasses(el, name, phase)
  }
}

/** `next`, plus each leaving node placed after the node that preceded it in `shown`. */
function merge(shown: Node[], next: Node[], leaving: Set<Node>): Node[] {
  if (!leaving.size) return next.slice()
  const inNext = new Set(next)
  // Leaving nodes grouped by the node of `next` they follow (null: at the start), in order.
  const after = new Map<Node | null, Node[]>()
  const placed = new Set<Node>()
  let anchor: Node | null = null
  for (const n of shown) {
    if (leaving.has(n) && !inNext.has(n)) {
      const group = after.get(anchor)
      if (group) group.push(n)
      else after.set(anchor, [n])
      placed.add(n)
    } else if (inNext.has(n)) anchor = n
  }
  const result: Node[] = []
  for (const n of leaving) if (!placed.has(n) && !inNext.has(n)) result.push(n)
  result.push(...(after.get(null) ?? []))
  for (const n of next) {
    result.push(n)
    const group = after.get(n)
    if (group) result.push(...group)
  }
  return result
}

/**
 * Animate elements entering and leaving: `<Transition name="fade">{open && <div>…</div>}</Transition>`.
 * Leaving elements stay in place until their animation ends. Works for conditionals and lists.
 */
export function Transition(props: TransitionProps): unknown {
  const name = props.name ?? 'keeno'
  const out = new State<Node[]>([], { equals: () => false })
  const leaving = new Set<Node>()
  const running = new Map<Node, () => void>()
  let current: Node[] = []
  let shown: Node[] = []
  let first = true

  const publish = () => {
    shown = merge(shown, current, leaving)
    out.set(shown)
  }

  resolve(
    () => props.children?.(),
    (v) => {
      const next: Node[] = []
      collect(v, next)
      const nextSet = new Set(next)
      const prevSet = new Set(current)
      for (const n of current) {
        if (nextSet.has(n)) continue
        running.get(n)?.()
        if (n.nodeType !== 1) continue
        leaving.add(n)
        running.set(
          n,
          animate(n as Element, name, 'leave', props.onLeave, () => {
            leaving.delete(n)
            running.delete(n)
            publish()
          }),
        )
      }
      for (const n of next) {
        if (prevSet.has(n)) continue
        if (leaving.delete(n)) running.get(n)?.()
        if (n.nodeType === 1 && (!first || props.appear) && !isServer()) {
          running.set(n, animate(n as Element, name, 'enter', props.onEnter, () => running.delete(n)))
        }
      }
      current = next
      first = false
      publish()
    },
  )
  // Unmounted mid-animation: stop timers and frames, and drop the leaving nodes.
  onCleanup(() => {
    for (const cancel of running.values()) cancel()
    running.clear()
    leaving.clear()
  })
  return () => out.get()
}

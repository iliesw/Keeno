// reparentable(): content rendered once that can be moved around the tree without being re-created.
import { getDocument, insert, keep, moveNode, region, trackKept, unplace } from './dom'
import { Owner, flush, getOwner, onCleanup, runWithOwner, untrack } from './signal'

export interface Reparentable {
  /** Render the content (the first call creates it). Put the handle itself in markup: `{player}`. */
  (): Node[]
  /**
   * Move the content into `target` (an element or a CSS selector), before `before` or at the end,
   * creating it if needed. It stays there, following its own updates, until it is moved again,
   * removed, or rendered by a place in markup that was not showing it before.
   */
  moveTo(target: Node | string, before?: Node | null): void
  /** Take the content out of the document. It stays alive and can be shown again as it was. */
  remove(): void
  /** The content's current nodes, wherever they are (without rendering or creating it). */
  nodes(): Node[]
  /** Destroy the content now and remove its nodes. Further renders show nothing. */
  dispose(): void
  /** True once the content was destroyed (with `dispose()` or with the component that created it). */
  readonly disposed: boolean
}

/**
 * Content that keeps its state when it moves to another place in the tree:
 * `const player = reparentable(() => <Video src={src} />)`, then `{player}` wherever it should
 * appear now, or `player.moveTo(element)` to move it imperatively. It is created the first time
 * it is rendered and lives as long as the component that called `reparentable()` (or until
 * `dispose()`), not as long as the place showing it. Moving it re-uses the same DOM nodes and
 * component instances, and in browsers with the native `moveBefore` it also keeps focus, loaded
 * iframes, playing media and running animations.
 *
 * Show it in one place at a time. While it is shown nowhere, it stays alive (its `update`
 * callbacks keep running) so that it can come back as it was. Context and error boundaries are
 * the ones around the `reparentable()` call.
 */
export function reparentable(render: () => unknown): Reparentable {
  const owner = new Owner(getOwner())
  let content: (() => Node[]) | null = null
  let disposed = false
  /** Owns the region keeping the content in place after `moveTo()`. */
  let placement: Owner | null = null
  /**
   * Places in markup (region computations) that rendered the content, with the `moved` count at
   * that time. After an imperative move or removal, such a place no longer gets the content back
   * just by updating; only a place that renders it anew takes it.
   */
  const sites = new WeakMap<Owner, number>()
  let moved = 0
  trackKept(1)

  const nodes = () => {
    content ??= runWithOwner(owner, () => untrack(() => region(render())))
    const out = content()
    keep(out)
    return out
  }

  const endPlacement = () => {
    placement?.dispose()
    placement = null
  }

  const handle = (() => {
    if (disposed) return []
    const site = getOwner()
    if (site && (sites.get(site) ?? moved) < moved) return []
    if (site) sites.set(site, moved)
    endPlacement()
    return nodes()
  }) as Reparentable

  handle.moveTo = (target, before = null) => {
    if (disposed) return
    const parent = typeof target === 'string' ? getDocument().querySelector(target) : target
    if (!parent) throw new Error(`[keeno] reparentable moveTo(): no element matches ${String(target)}`)
    moved++
    const current = untrack(nodes)
    // Move right away (and natively), then keep the content in place as it updates.
    for (const n of current) moveNode(n, parent, before)
    const previous = placement
    placement = new Owner(owner)
    runWithOwner(placement, () => insert(parent, nodes, before))
    previous?.dispose()
    flush()
  }

  handle.remove = () => {
    if (disposed) return
    moved++
    endPlacement()
    if (content) unplace(untrack(content))
  }

  handle.nodes = () => (content ? untrack(content) : [])

  onCleanup(() => {
    disposed = true
    trackKept(-1)
    const current = content ? untrack(content) : []
    content = null
    placement = null
    for (const n of current) n.parentNode?.removeChild(n)
  }, owner)

  handle.dispose = () => owner.dispose()
  Object.defineProperty(handle, 'disposed', { get: () => disposed })
  return handle
}

export interface KeyedReparentable<K> {
  /** The content for `key`, created on first use: `{cards.map((c) => cardView(c.id))}`. */
  (key: K): Reparentable
  /** Destroy the content for `key` (for example when its item is deleted). */
  delete(key: K): void
  /** The keys that currently have content. */
  keys(): K[]
}

/**
 * One reparentable per key, for items that move between lists (a kanban board, drag and drop
 * between containers): `const cardView = keyedReparentable((id) => <Card id={id} />)`. Every
 * entry belongs to the component that called `keyedReparentable()`, even when it is first used
 * inside a list row, so it survives its row being removed from one list and added to another.
 */
export function keyedReparentable<K>(render: (key: K) => unknown): KeyedReparentable<K> {
  const owner = getOwner()
  const entries = new Map<K, Reparentable>()
  const get = ((key: K) => {
    let entry = entries.get(key)
    if (!entry || entry.disposed) {
      entry = runWithOwner(owner, () => reparentable(() => render(key)))
      entries.set(key, entry)
    }
    return entry
  }) as KeyedReparentable<K>
  get.delete = (key) => {
    entries.get(key)?.dispose()
    entries.delete(key)
  }
  get.keys = () => [...entries.keys()].filter((k) => !entries.get(k)!.disposed)
  return get
}

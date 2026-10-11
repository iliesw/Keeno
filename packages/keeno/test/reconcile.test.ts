// The list reconciler: random edits always produce exactly the target order, and common edits
// (swap, remove, append, prepend) move only the nodes they have to.
import { describe, expect, test } from 'bun:test'
import { reconcile } from '../src/dom'

function setup(n: number, withMarker: boolean) {
  const parent = document.createElement('div')
  const before = document.createElement('i')
  parent.appendChild(before)
  const nodes = Array.from({ length: n }, (_, i) => {
    const el = document.createElement('b')
    el.textContent = String(i)
    return el
  })
  for (const el of nodes) parent.appendChild(el)
  const marker = withMarker ? document.createComment('') : null
  if (marker) parent.appendChild(marker)
  const after = document.createElement('u')
  if (marker) parent.appendChild(after)
  return { parent, before, nodes, marker, after }
}

/** Deterministic pseudo-random numbers. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

function countMoves(parent: Node, fn: () => void): number {
  let ops = 0
  const ins = parent.insertBefore.bind(parent)
  const rep = parent.replaceChild.bind(parent)
  const rem = parent.removeChild.bind(parent)
  ;(parent as any).insertBefore = (a: Node, b: Node | null) => (ops++, ins(a, b))
  ;(parent as any).replaceChild = (a: Node, b: Node) => (ops++, rep(a, b))
  ;(parent as any).removeChild = (a: Node) => (ops++, rem(a))
  fn()
  delete (parent as any).insertBefore
  delete (parent as any).replaceChild
  delete (parent as any).removeChild
  return ops
}

describe('reconcile', () => {
  for (const withMarker of [false, true]) {
    test(`random edits reach the target order (${withMarker ? 'before a marker' : 'at the end'})`, () => {
      const random = rng(withMarker ? 7 : 42)
      for (let round = 0; round < 400; round++) {
        const { parent, before, nodes, marker, after } = setup(Math.floor(random() * 12), withMarker)
        const pool = [...nodes, ...Array.from({ length: 4 }, () => document.createElement('s'))]
        // Random subset of the pool, shuffled.
        const next = pool.filter(() => random() < 0.7).sort(() => random() - 0.5)
        reconcile(parent, nodes, next, marker)
        const expected = [before, ...next, ...(marker ? [marker, after] : [])]
        expect([...parent.childNodes]).toEqual(expected)
      }
    })
  }

  test('common list edits touch few nodes', () => {
    const cases: [string, (a: Node[]) => Node[], number][] = [
      ['swap two rows', (a) => { const b = a.slice(); [b[1], b[998]] = [b[998], b[1]]; return b }, 2],
      ['remove one row', (a) => a.filter((_, i) => i !== 500), 1],
      ['append ten rows', (a) => [...a, ...Array.from({ length: 10 }, () => document.createElement('p'))], 10],
      ['prepend one row', (a) => [document.createElement('p'), ...a], 1],
      ['reverse', (a) => a.slice().reverse(), 1000],
    ]
    for (const [name, edit, maxOps] of cases) {
      const { parent, nodes } = setup(1000, false)
      const next = edit(nodes)
      const ops = countMoves(parent, () => reconcile(parent, nodes, next, null))
      expect({ name, ok: ops <= maxOps, ops }).toEqual({ name, ok: true, ops })
      expect([...parent.childNodes].slice(1) as Node[]).toEqual(next)
    }
  })

  test('nodes moved away by someone else are handled', () => {
    const { parent, nodes } = setup(5, false)
    document.body.appendChild(nodes[2]) // no longer under parent
    const next = [nodes[4], nodes[2], nodes[0]]
    reconcile(parent, nodes, next, null)
    expect([...parent.childNodes].slice(1)).toEqual(next)
  })
})

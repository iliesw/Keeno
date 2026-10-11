// Server-side rendering: render a component to an HTML string with a server DOM (linkedom).
// `init` and `update` callbacks don't run on the server; render-time code and templates do.
import { createComponent, type Component } from './component'
import { insert, setDocument } from './dom'
import { Owner, runWithOwner } from './signal'

let shared: Document | undefined

async function serverDocument(): Promise<Document> {
  if (shared) return shared
  let linkedom: typeof import('linkedom')
  try {
    linkedom = await import('linkedom')
  } catch {
    throw new Error('[lux] renderToString() needs the "linkedom" package: bun add linkedom')
  }
  shared = linkedom.parseHTML('<!doctype html><html><head></head><body></body></html>').document as unknown as Document
  return shared
}

/**
 * Render `Comp` to HTML using `doc` to create nodes. Synchronous: what is pending at the end
 * (for example an `<Await>` promise) is rendered in its pending state.
 */
export function renderToStringWith<P extends Record<string, any>>(doc: Document, Comp: Component<P>, props: P = {} as P): string {
  const root = new Owner(null)
  const container = doc.createElement('div')
  setDocument(doc)
  try {
    runWithOwner(root, () => insert(container, () => createComponent(Comp, props)))
    return container.innerHTML
  } finally {
    root.dispose()
    setDocument(null)
  }
}

/**
 * Render `Comp` to an HTML string on the server (Node, Bun or Deno). Put the result in your page
 * and call `hydrate(Comp, element)` in the browser to make it interactive.
 */
export async function renderToString<P extends Record<string, any>>(Comp: Component<P>, props: P = {} as P): Promise<string> {
  return renderToStringWith(await serverDocument(), Comp, props)
}

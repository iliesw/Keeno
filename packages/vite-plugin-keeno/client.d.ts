// Types for the modules the plugin provides: `/// <reference types="@inflector/vite-plugin-keeno/client" />`.
declare module 'virtual:keeno-pages' {
  import type { RouteDefinition, RouterProps } from '@inflector/keeno-router'
  /** The routes of the pages directory, most specific first. */
  export const routes: RouteDefinition[]
  /** Renders the page for the current URL, inside its layouts. */
  const Pages: import('@inflector/keeno').Component<Omit<RouterProps, 'routes'>>
  export default Pages
  /**
   * Start the app the way `renderStrategy` says: mount the pages (`spa`), hydrate the
   * server-rendered page (`ssr`, `ssg`), or hydrate its islands (`islands`).
   */
  export function start(target?: string | Element): unknown
}

declare module 'virtual:keeno-server' {
  import type { RouteDefinition } from '@inflector/keeno-router'
  export const routes: RouteDefinition[]
  /** Render the page for `url`. With `stream`, resolves once the first chunk is ready. */
  export function render(
    url: string,
    options?: { stream?: boolean },
  ): Promise<{ html?: string; stream?: ReadableStream<string>; head: string; status: number }>
}

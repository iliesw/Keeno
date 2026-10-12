// Types for the modules the plugin provides: `/// <reference types="@inflector/vite-plugin-keeno/client" />`.
declare module 'virtual:keeno-pages' {
  import type { RouteDefinition, RouterProps } from '@inflector/keeno-router'
  /** The routes of the pages directory, most specific first. */
  export const routes: RouteDefinition[]
  /** Renders the page for the current URL, inside its layouts. */
  const Pages: import('@inflector/keeno').Component<Omit<RouterProps, 'routes'>>
  export default Pages
}

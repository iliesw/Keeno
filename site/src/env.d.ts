/// <reference types="vite/client" />

declare module '*.kn' {
  const Component: import('@inflector/keeno').Component<any>
  export default Component
}

declare module '*.md' {
  const doc: import('./docs').DocModule
  export default doc
}

declare module 'virtual:keeno-runtime' {
  /** The Keeno runtime (public API and compiler helpers) as one ES module. */
  export const keeno: string
  /** @inflector/keeno-router, importing `@inflector/keeno`. */
  export const router: string
}

declare module '*?highlight' {
  const file: { raw: string; html: string }
  export default file
}

declare module '*?compiled' {
  const file: { raw: string; html: string }
  export default file
}

declare module '*?search' {
  const page: { title: string; sections: { id: string; heading: string; text: string }[] }
  export default page
}

declare module 'virtual:keeno-stats' {
  /** Gzipped size of the minified runtime, in KB. */
  export const runtimeKb: number
  export const routerKb: number
}

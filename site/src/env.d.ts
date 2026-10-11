/// <reference types="vite/client" />

declare module '*.lx' {
  const Component: import('@inflector/lux').Component<any>
  export default Component
}

declare module '*.md' {
  const doc: import('./docs').DocModule
  export default doc
}

declare module 'virtual:lux-runtime' {
  /** The Lux runtime (public API and compiler helpers) as one ES module. */
  export const lux: string
  /** @inflector/lux-router, importing `@inflector/lux`. */
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

declare module 'virtual:lux-stats' {
  /** Gzipped size of the minified runtime, in KB. */
  export const runtimeKb: number
  export const routerKb: number
}

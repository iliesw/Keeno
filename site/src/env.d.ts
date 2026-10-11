/// <reference types="vite/client" />

declare module '*.lx' {
  const Component: import('@inflector/lux').Component<any>
  export default Component
}

declare module '*.md' {
  const doc: import('./docs').DocModule
  export default doc
}

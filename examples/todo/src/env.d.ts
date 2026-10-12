/// <reference types="vite/client" />

declare module '*.kn' {
  const Component: import('@inflector/keeno').Component
  export default Component
}

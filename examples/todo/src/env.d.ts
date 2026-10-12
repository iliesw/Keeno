/// <reference types="vite/client" />
/// <reference types="@inflector/vite-plugin-keeno/client" />

declare module '*.kn' {
  const Component: import('@inflector/keeno').Component
  export default Component
}

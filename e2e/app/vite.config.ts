import { defineConfig } from 'vite'
import keeno from '@inflector/vite-plugin-keeno'

export default defineConfig({
  plugins: [keeno()],
  // Workspace only: load the `@inflector/keeno` runtime from packages/keeno/src instead of its dist/ build.
  // Apps installing keeno from npm don't need this.
  resolve: { conditions: ['keeno-source'] },
})

import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import keeno from '@inflector/vite-plugin-keeno'

export default defineConfig({
  plugins: [keeno(), tailwindcss()],
  // Workspace only: load the `@inflector/keeno` runtime from packages/keeno/src instead of its dist/ build.
  // Apps installing keeno from npm don't need this.
  resolve: { conditions: ['keeno-source'] },
})

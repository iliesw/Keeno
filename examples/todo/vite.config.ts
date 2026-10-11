import { defineConfig } from 'vite'
import lux from '@inflector/vite-plugin-lux'

export default defineConfig({
  plugins: [lux()],
  // Workspace only: load the `@inflector/lux` runtime from packages/lux/src instead of its dist/ build.
  // Apps installing lux from npm don't need this.
  resolve: { conditions: ['lux-source'] },
})

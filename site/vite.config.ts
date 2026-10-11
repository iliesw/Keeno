import lux from '@inflector/vite-plugin-lux'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import markdown from './plugins/markdown'

export default defineConfig({
  plugins: [markdown(), lux(), tailwindcss()],
  // Workspace only: load the Lux runtime and router from their sources instead of dist/.
  resolve: { conditions: ['lux-source'] },
  // The docs live in ../docs, outside the Vite root.
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2022' },
})

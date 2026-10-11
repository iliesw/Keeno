import lux from '@inflector/vite-plugin-lux'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import markdown from './plugins/markdown'
import runtime from './plugins/runtime'

export default defineConfig({
  plugins: [markdown(), runtime(), lux(), tailwindcss()],
  // Workspace only: load the Lux runtime, router and compiler from their sources instead of dist/.
  resolve: { conditions: ['lux-source'] },
  // The docs live in ../docs, outside the Vite root.
  server: { fs: { allow: ['..'] } },
  // The playground's editor and in-browser compiler are large, but load only on /playground.
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  // The playground compiles `.lx` files in a worker with the real compiler.
  worker: { format: 'es' },
})

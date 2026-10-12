import keeno from '@inflector/vite-plugin-keeno'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import markdown from './plugins/markdown'
import runtime from './plugins/runtime'

export default defineConfig({
  plugins: [markdown(), runtime(), keeno(), tailwindcss()],
  // Workspace only: load the Keeno runtime, router and compiler from their sources instead of dist/.
  resolve: { conditions: ['keeno-source'] },
  // The docs live in ../docs, outside the Vite root.
  server: { fs: { allow: ['..'] } },
  // The playground's editor and in-browser compiler are large, but load only on /playground.
  // strictRequires: Babel (bundled into the playground's compiler worker) has circular requires that the
  // default 'auto' mode hoists differently per OS, which broke the worker on Linux builds.
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, commonjsOptions: { strictRequires: true } },
  // The playground compiles `.kn` files in a worker with the real compiler.
  worker: { format: 'es' },
})

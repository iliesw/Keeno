// Render strategies fixture (e2e/render.e2e.ts): KEENO_STRATEGY picks ssr, ssg or islands.
import { defineConfig } from 'vite'
import keeno, { type RenderStrategy } from '@inflector/vite-plugin-keeno'

export default defineConfig({
  plugins: [keeno({ renderStrategy: (process.env.KEENO_STRATEGY as RenderStrategy) ?? 'ssr', prerender: ['/blog/hello'] })],
  // Workspace only: load the runtime from packages/*/src.
  resolve: { conditions: ['keeno-source'] },
  ssr: { resolve: { conditions: ['keeno-source'] } },
})

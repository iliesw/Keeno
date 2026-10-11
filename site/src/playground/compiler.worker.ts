// Compiles playground files off the main thread: `.kn` with the real Keeno compiler, then
// TypeScript is stripped with sucrase (the same job esbuild/Oxc do in the Vite plugin).
import './process-shim'
import { compile } from '@inflector/keeno-compiler'
import { transform } from 'sucrase'
import type { CompiledFile, CompileRequest, CompileResponse } from './types'

function stripTypes(code: string, filename: string): string {
  return transform(code, { transforms: ['typescript'], filePath: filename, disableESTransforms: true, keepUnusedImports: true }).code
}

function message(err: any, filename: string): string {
  const text = String(err?.message ?? err)
  return text.startsWith(filename) ? text : `${filename}: ${text}`
}

function compileFile(name: string, source: string): CompiledFile {
  const t0 = performance.now()
  try {
    if (name.endsWith('.kn')) {
      const out = compile(source, { filename: name })
      return { name, js: stripTypes(out.js, name), css: out.css, ms: performance.now() - t0 }
    }
    if (/\.(ts|js|mjs)$/.test(name)) return { name, js: stripTypes(source, name), css: '', ms: performance.now() - t0 }
    if (name.endsWith('.css')) return { name, js: '', css: source, ms: 0 }
    return { name, js: `export default ${JSON.stringify(source)}`, css: '', ms: 0 }
  } catch (err) {
    return { name, js: '', css: '', error: message(err, name), ms: performance.now() - t0 }
  }
}

self.onmessage = (e: MessageEvent<CompileRequest>) => {
  const { id, files } = e.data
  const response: CompileResponse = { id, files: files.map((f) => compileFile(f.name, f.code)) }
  ;(self as unknown as Worker).postMessage(response)
}

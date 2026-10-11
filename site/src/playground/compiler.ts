// Main-thread side of the compiler worker: one request in flight per call, answers matched by id.
import type { CompiledFile, CompileResponse, PlaygroundFile } from './types'

export interface Compiler {
  compile(files: PlaygroundFile[]): Promise<CompiledFile[]>
  terminate(): void
}

export function createCompiler(): Compiler {
  const worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, (files: CompiledFile[]) => void>()
  let next = 0
  worker.onmessage = (e: MessageEvent<CompileResponse>) => {
    pending.get(e.data.id)?.(e.data.files)
    pending.delete(e.data.id)
  }
  return {
    compile(files) {
      const id = ++next
      return new Promise((resolve) => {
        pending.set(id, resolve)
        worker.postMessage({ id, files })
      })
    },
    terminate() {
      worker.terminate()
      pending.clear()
    },
  }
}

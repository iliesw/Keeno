export interface PlaygroundFile {
  name: string
  code: string
}

export interface CompiledFile {
  name: string
  /** JavaScript module ('' for CSS files or on error). */
  js: string
  /** Scoped CSS of a component, or the content of a .css file. */
  css: string
  error?: string
  /** Compile time in milliseconds. */
  ms: number
}

export interface CompileRequest {
  id: number
  files: PlaygroundFile[]
}

export interface CompileResponse {
  id: number
  files: CompiledFile[]
}

export interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  text: string
  count: number
}

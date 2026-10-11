// Type-check a project's .lx (and .ts) files the way the editor does: the Lux language plugin turns
// each .lx file into virtual TSX, and @volar/kit runs TypeScript over a tsconfig and maps the
// diagnostics back to .lx positions.
import { createLuxLanguagePlugin } from '@inflector/lux-language-server'
import { createTypeScriptChecker } from '@volar/kit'
import path from 'node:path'
import ts from 'typescript'
import { create as createTypeScriptServices } from 'volar-service-typescript'

export interface Problem {
  file: string
  /** 1-based. */
  line: number
  /** 1-based. */
  column: number
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface CheckResult {
  /** Files that were checked (absolute, forward slashes). */
  files: string[]
  problems: Problem[]
}

export interface CheckOptions {
  /** Also check the .ts/.tsx files of the project, not only .lx files. Default: true. */
  all?: boolean
}

export async function check(tsconfig: string, options: CheckOptions = {}): Promise<CheckResult> {
  const checker = createTypeScriptChecker(
    [createLuxLanguagePlugin(ts)],
    createTypeScriptServices(ts),
    path.resolve(tsconfig),
  )
  const files = checker
    .getRootFileNames()
    .filter((f) => (options.all === false ? f.endsWith('.lx') : !f.endsWith('.d.ts')))
    .sort()
  const problems: Problem[] = []
  for (const file of files) {
    for (const d of await checker.check(file)) {
      if (d.severity !== 1 && d.severity !== 2) continue
      problems.push({
        file,
        line: d.range.start.line + 1,
        column: d.range.start.character + 1,
        severity: d.severity === 1 ? 'error' : 'warning',
        code: d.code === undefined ? '' : typeof d.code === 'number' ? `TS${d.code}` : d.code,
        message: typeof d.message === 'string' ? d.message : String(d.message),
      })
    }
  }
  problems.sort((a, b) => (a.file === b.file ? a.line - b.line || a.column - b.column : a.file < b.file ? -1 : 1))
  return { files, problems }
}

/** `file:line:col - error TS2322: message`, with the file relative to `cwd`. */
export function format(p: Problem, cwd = process.cwd()): string {
  const file = path.relative(cwd, p.file).replaceAll('\\', '/')
  const code = p.code ? ` ${p.code}` : ''
  return `${file}:${p.line}:${p.column} - ${p.severity}${code}: ${p.message.replace(/\r?\n/g, '\n  ')}`
}

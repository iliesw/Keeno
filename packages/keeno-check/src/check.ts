// Type-check a project's .kn (and .ts) files the way the editor does: the Keeno language plugin turns
// each .kn file into virtual TSX, and @volar/kit runs TypeScript over a tsconfig and maps the
// diagnostics back to .kn positions. Each .kn file is also run through the compiler, so a project
// that passes the check also builds.
import { compile } from '@inflector/keeno-compiler'
import { createKeenoLanguagePlugin } from '@inflector/keeno-language-server'
import { createTypeScriptChecker } from '@volar/kit'
import { readFileSync } from 'node:fs'
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
  /** Also check the .ts/.tsx files of the project, not only .kn files. Default: true. */
  all?: boolean
}

export async function check(tsconfig: string, options: CheckOptions = {}): Promise<CheckResult> {
  const checker = createTypeScriptChecker(
    [createKeenoLanguagePlugin(ts)],
    createTypeScriptServices(ts),
    path.resolve(tsconfig),
  )
  const files = checker
    .getRootFileNames()
    .filter((f) => (options.all === false ? f.endsWith('.kn') : !f.endsWith('.d.ts')))
    .sort()
  const problems: Problem[] = []
  for (const file of files) {
    const before = problems.length
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
    if (file.endsWith('.kn')) {
      const error = compileError(file)
      // TypeScript already reports syntax errors (with better messages); the compiler's are only
      // needed when nothing else flagged the file.
      if (error && !(error.syntax && problems.length > before)) problems.push(error.problem)
    }
  }
  problems.sort((a, b) => (a.file === b.file ? a.line - b.line || a.column - b.column : a.file < b.file ? -1 : 1))
  return { files, problems }
}

/** The error `vite build` would stop on for this .kn file, if any. */
function compileError(file: string): { problem: Problem; syntax: boolean } | undefined {
  try {
    compile(readFileSync(file, 'utf8'), { filename: file })
    return undefined
  } catch (err: any) {
    // Babel messages: `<file>: message (line:col)` followed by a code frame.
    const message = String(err?.message ?? err)
      .split(/\r?\n/)[0]
      .replace(/^.*?\.kn: /, '')
      .replace(/ \(\d+:\d+\)$/, '')
    return {
      problem: {
        file,
        line: err?.loc?.line ?? 1,
        column: (err?.loc?.column ?? 0) + 1,
        severity: 'error',
        code: 'keeno',
        message,
      },
      syntax: err?.code === 'BABEL_PARSER_SYNTAX_ERROR',
    }
  }
}

/** `file:line:col - error TS2322: message`, with the file relative to `cwd`. */
export function format(p: Problem, cwd = process.cwd()): string {
  const file = path.relative(cwd, p.file).replaceAll('\\', '/')
  const code = p.code ? ` ${p.code}` : ''
  return `${file}:${p.line}:${p.column} - ${p.severity}${code}: ${p.message.replace(/\r?\n/g, '\n  ')}`
}

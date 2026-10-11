// Volar language plugin for .lx files.
import type { LanguagePlugin } from '@volar/language-core'
import type {} from '@volar/typescript'
import type * as TS from 'typescript'
import type { URI } from 'vscode-uri'
import { LuxVirtualCode } from './virtualCode'

export { generateScript, LuxVirtualCode } from './virtualCode'

export function createLuxLanguagePlugin(ts: typeof TS): LanguagePlugin<URI> {
  return {
    getLanguageId(uri) {
      if (uri.path.endsWith('.lx')) return 'lux'
    },
    createVirtualCode(_uri, languageId, snapshot) {
      if (languageId === 'lux') return new LuxVirtualCode(snapshot, ts)
    },
    typescript: {
      extraFileExtensions: [{ extension: 'lx', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
      getServiceScript(root) {
        const code = root.embeddedCodes?.find((c) => c.id === 'script')
        if (!code) return
        const isTs = code.languageId === 'typescriptreact'
        return { code, extension: isTs ? '.tsx' : '.jsx', scriptKind: isTs ? ts.ScriptKind.TSX : ts.ScriptKind.JSX }
      },
      // .lx markup is JSX typed by the global JSX namespace from `@inflector/lux/lx`.
      resolveLanguageServiceHost(host) {
        return new Proxy(host, {
          get(target, key, receiver) {
            if (key === 'getCompilationSettings') {
              return () => ({
                ...target.getCompilationSettings(),
                jsx: ts.JsxEmit.Preserve,
                jsxFactory: undefined,
                jsxImportSource: undefined,
                allowJs: true,
              })
            }
            return Reflect.get(target, key, receiver)
          },
        })
      },
    },
  }
}

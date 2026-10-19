// Volar language plugin for .kn files.
import type { LanguagePlugin } from '@volar/language-core'
import type {} from '@volar/typescript'
import type * as TS from 'typescript'
import type { URI } from 'vscode-uri'
import { KeenoVirtualCode } from './virtualCode'

export { componentName, generateScript, KeenoVirtualCode } from './virtualCode'

export function createKeenoLanguagePlugin(ts: typeof TS): LanguagePlugin<URI> {
  return {
    getLanguageId(uri) {
      if (uri.path.endsWith('.kn')) return 'keeno'
    },
    createVirtualCode(uri, languageId, snapshot) {
      if (languageId === 'keeno') return new KeenoVirtualCode(snapshot, ts, uri.path)
    },
    typescript: {
      extraFileExtensions: [{ extension: 'kn', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
      getServiceScript(root) {
        const code = root.embeddedCodes?.find((c) => c.id === 'script')
        if (!code) return
        const isTs = code.languageId === 'typescriptreact'
        return { code, extension: isTs ? '.tsx' : '.jsx', scriptKind: isTs ? ts.ScriptKind.TSX : ts.ScriptKind.JSX }
      },
      // .kn markup is JSX typed by the global JSX namespace from `@inflector/keeno/kn`.
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

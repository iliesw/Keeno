// Language server entry point (stdio / IPC). Bundled into the VS Code extension.
import {
  createConnection,
  createServer,
  createTypeScriptProject,
  loadTsdkByPath,
  type LanguageServiceContext,
} from '@volar/language-server/node'
import { create as createCssService } from 'volar-service-css'
import { create as createTypeScriptServices } from 'volar-service-typescript'
import { newCSSDataProvider, type ICSSDataProvider } from 'vscode-css-languageservice'
import { Utils } from 'vscode-uri'
import { createLuxLanguagePlugin } from './index'
import { tailwindCssData } from './tailwind'

const tailwindData = newCSSDataProvider(tailwindCssData)

/** Tailwind's directives, plus the files listed in the user's `css.customData` setting (as the default does). */
async function getCustomData(context: LanguageServiceContext): Promise<ICSSDataProvider[]> {
  const providers = [tailwindData]
  const paths: string[] = (await context.env.getConfiguration?.('css.customData')) ?? []
  for (const p of paths) {
    for (const folder of context.env.workspaceFolders) {
      const json = await context.env.fs?.readFile?.(Utils.resolvePath(folder, p))
      if (!json) continue
      try {
        providers.push(newCSSDataProvider(JSON.parse(json)))
      } catch (err) {
        console.error(err)
      }
      break
    }
  }
  return providers
}

const connection = createConnection()
const server = createServer(connection)

connection.listen()

connection.onInitialize((params) => {
  const tsdkPath = params.initializationOptions?.typescript?.tsdk
  if (!tsdkPath) throw new Error('[lux] initializationOptions.typescript.tsdk is required')
  const tsdk = loadTsdkByPath(tsdkPath, params.locale)
  return server.initialize(
    params,
    createTypeScriptProject(tsdk.typescript, tsdk.diagnosticMessages, () => ({
      languagePlugins: [createLuxLanguagePlugin(tsdk.typescript)],
    })),
    [createCssService({ getCustomData }), ...createTypeScriptServices(tsdk.typescript)],
  )
})

connection.onInitialized(server.initialized)
connection.onShutdown(server.shutdown)

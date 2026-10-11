// Language server entry point (stdio / IPC). Bundled into the VS Code extension.
import { createConnection, createServer, createTypeScriptProject, loadTsdkByPath } from '@volar/language-server/node'
import { create as createCssService } from 'volar-service-css'
import { create as createTypeScriptServices } from 'volar-service-typescript'
import { createLuxLanguagePlugin } from './index'

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
    [createCssService(), ...createTypeScriptServices(tsdk.typescript)],
  )
})

connection.onInitialized(server.initialized)
connection.onShutdown(server.shutdown)

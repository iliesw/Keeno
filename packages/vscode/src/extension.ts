// VS Code client: starts the Lux language server for .lx files.
import { getTsdk } from '@volar/vscode'
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from '@volar/vscode/node'
import * as vscode from 'vscode'

let client: LanguageClient | undefined

export async function activate(context: vscode.ExtensionContext) {
  const module = vscode.Uri.joinPath(context.extensionUri, 'dist', 'server.js').fsPath
  const serverOptions: ServerOptions = {
    run: { module, transport: TransportKind.ipc },
    debug: { module, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6009'] } },
  }
  const tsdk = await getTsdk(context)
  if (!tsdk) {
    void vscode.window.showErrorMessage('Lux: could not find a TypeScript installation for IntelliSense.')
    return
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'lux' }],
    initializationOptions: { typescript: { tsdk: tsdk.tsdk } },
  }
  client = new LanguageClient('lux', 'Lux Language Server', serverOptions, clientOptions)
  await client.start()
}

export function deactivate() {
  return client?.stop()
}

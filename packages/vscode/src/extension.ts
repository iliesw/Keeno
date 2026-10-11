// VS Code client: starts the Keeno language server for .kn files.
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
    void vscode.window.showErrorMessage('Keeno: could not find a TypeScript installation for IntelliSense.')
    return
  }
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'keeno' }],
    initializationOptions: { typescript: { tsdk: tsdk.tsdk } },
  }
  client = new LanguageClient('keeno', 'Keeno Language Server', serverOptions, clientOptions)
  await client.start()
}

export function deactivate() {
  return client?.stop()
}

import { resolve } from 'node:path'
import { JsonMcpClientAdapter } from './json-adapter'

export const vscodeAdapter = new JsonMcpClientAdapter({
  id: 'vscode',
  displayName: 'VS Code',
  executableNames: ['code'],
  supportedScopes: ['project'],
  configPath: context => resolve(context.cwd, '.vscode', 'mcp.json'),
  serverKey: 'servers',
})

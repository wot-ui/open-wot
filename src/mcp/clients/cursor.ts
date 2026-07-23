import { join, resolve } from 'node:path'
import { JsonMcpClientAdapter } from './json-adapter'

export const cursorAdapter = new JsonMcpClientAdapter({
  id: 'cursor',
  displayName: 'Cursor',
  executableNames: ['cursor-agent', 'cursor'],
  supportedScopes: ['project', 'user'],
  configPath: (context, scope) => scope === 'project'
    ? resolve(context.cwd, '.cursor', 'mcp.json')
    : join(context.homeDir, '.cursor', 'mcp.json'),
  serverKey: 'mcpServers',
})

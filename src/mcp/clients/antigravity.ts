import { join, resolve } from 'node:path'
import { JsonMcpClientAdapter } from './json-adapter'
import { REQUIRED_WOT_MCP_TOOLS } from './types'

function serverProblem(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const entry = value as Record<string, unknown>
  if (entry.disabled === true)
    return 'The wot-ui MCP server is disabled in Antigravity'
  if (entry.disabled !== undefined && typeof entry.disabled !== 'boolean')
    return 'The Antigravity wot-ui disabled field must be a boolean'
  const disabledTools = entry.disabledTools
  if (disabledTools !== undefined) {
    if (!Array.isArray(disabledTools) || !disabledTools.every(tool => typeof tool === 'string'))
      return 'The Antigravity wot-ui disabledTools field must be a string array'
    const unavailableTools = REQUIRED_WOT_MCP_TOOLS.filter(tool => disabledTools.includes(tool))
    if (unavailableTools.length > 0)
      return `Antigravity disables required wot-ui tools: ${unavailableTools.join(', ')}`
  }
  return undefined
}

export const antigravityAdapter = new JsonMcpClientAdapter({
  id: 'antigravity',
  displayName: 'Antigravity',
  executableNames: ['agy-ide', 'agy'],
  supportedScopes: ['project', 'user'],
  configPath: (context, scope) => scope === 'project'
    ? resolve(context.cwd, '.agents', 'mcp_config.json')
    : join(context.homeDir, '.gemini', 'config', 'mcp_config.json'),
  serverKey: 'mcpServers',
  serverProblem,
  verifyRegistration: async () => ({
    status: 'unsupported',
    message: 'Antigravity does not expose a stable non-interactive MCP registration status check',
    action: 'Open Antigravity in this workspace and run /mcp to confirm the wot-ui server.',
  }),
})

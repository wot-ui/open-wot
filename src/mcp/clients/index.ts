import type { McpClientAdapter, McpClientId } from './types'
import { claudeAdapter } from './claude'
import { codexAdapter } from './codex'
import { cursorAdapter } from './cursor'
import { vscodeAdapter } from './vscode'

export const mcpClientAdapters: McpClientAdapter[] = [
  claudeAdapter,
  cursorAdapter,
  vscodeAdapter,
  codexAdapter,
]

export function getMcpClientAdapter(id: McpClientId): McpClientAdapter {
  const adapter = mcpClientAdapters.find(candidate => candidate.id === id)
  if (!adapter)
    throw new Error(`Unsupported MCP client: ${id}`)
  return adapter
}

export * from './types'

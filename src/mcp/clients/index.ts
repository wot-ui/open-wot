import type { McpClientAdapter, McpClientId } from './types'
import { antigravityAdapter } from './antigravity'
import { claudeAdapter } from './claude'
import { codexAdapter } from './codex'
import { cursorAdapter } from './cursor'
import { opencodeAdapter } from './opencode'
import { vscodeAdapter } from './vscode'

export const mcpClientAdapters: McpClientAdapter[] = [
  claudeAdapter,
  cursorAdapter,
  vscodeAdapter,
  codexAdapter,
  opencodeAdapter,
  antigravityAdapter,
]

export function getMcpClientAdapter(id: McpClientId): McpClientAdapter {
  const adapter = mcpClientAdapters.find(candidate => candidate.id === id)
  if (!adapter)
    throw new Error(`Unsupported MCP client: ${id}`)
  return adapter
}

export * from './types'

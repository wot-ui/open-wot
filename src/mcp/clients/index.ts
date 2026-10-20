import type { McpClientAdapter, McpClientId } from './types'
import { antigravityAdapter } from './antigravity'
import { claudeAdapter } from './claude'
import { codebuddyAdapter, codebuddyCliAdapter } from './codebuddy'
import { codexAdapter } from './codex'
import { cursorAdapter } from './cursor'
import { deepseekAdapter } from './deepseek'
import { opencodeAdapter } from './opencode'
import { qoderAdapter, qoderCliAdapter } from './qoder'
import { vscodeAdapter } from './vscode'

export const mcpClientAdapters: McpClientAdapter[] = [
  claudeAdapter,
  cursorAdapter,
  vscodeAdapter,
  codexAdapter,
  opencodeAdapter,
  antigravityAdapter,
  deepseekAdapter,
  qoderAdapter,
  qoderCliAdapter,
  codebuddyAdapter,
  codebuddyCliAdapter,
]

export function getMcpClientAdapter(id: McpClientId): McpClientAdapter {
  const adapter = mcpClientAdapters.find(candidate => candidate.id === id)
  if (!adapter)
    throw new Error(`Unsupported MCP client: ${id}`)
  return adapter
}

export * from './types'

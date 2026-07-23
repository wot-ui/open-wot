import type { McpServer } from '@modelcontextprotocol/server'
import { describe, expect, it, vi } from 'vitest'
import * as z from 'zod/v4'
import { registerMcpTools } from '../../src/mcp/tools'

interface ToolConfig {
  description: string
  inputSchema: z.ZodType
}

describe('mcp tool contracts', () => {
  it('snapshots tool names and input schemas', () => {
    const contracts: Record<string, unknown> = {}
    const server = {
      registerTool: vi.fn((name: string, config: ToolConfig) => {
        contracts[name] = {
          description: config.description,
          inputSchema: z.toJSONSchema(config.inputSchema),
        }
      }),
    }

    registerMcpTools(server as unknown as McpServer)

    expect(contracts).toMatchSnapshot()
  })
})

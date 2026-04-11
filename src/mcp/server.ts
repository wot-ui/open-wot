import process from 'node:process'
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import packageJson from '../../package.json'
import { WOT_EXPERT_PROMPT, WOT_PAGE_GENERATOR_PROMPT } from './prompts'
import { registerMcpTools } from './tools'

export async function startMcpServer(): Promise<void> {
  const server = new McpServer(
    {
      name: 'wot-ui',
      version: packageJson.version,
    },
    {
      instructions: 'Use wot-ui component tools before generating UI code. Only wot-ui v2 metadata is available in this server.',
      capabilities: { logging: {} },
    },
  )

  registerMcpTools(server)

  server.registerPrompt('wot-expert', {
    description: 'General wot-ui expert workflow.',
  }, async () => ({
    messages: [
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: WOT_EXPERT_PROMPT,
        },
      },
    ],
  }))

  server.registerPrompt('wot-page-generator', {
    description: 'Workflow for generating a wot-ui page.',
    argsSchema: z.object({ goal: z.string().optional() }),
  }, async ({ goal }) => ({
    messages: [
      {
        role: 'assistant',
        content: {
          type: 'text',
          text: goal ? `${WOT_PAGE_GENERATOR_PROMPT} Goal: ${goal}` : WOT_PAGE_GENERATOR_PROMPT,
        },
      },
    ],
  }))

  const transport = new StdioServerTransport()
  await server.connect(transport)

  const shutdown = async (): Promise<void> => {
    await server.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

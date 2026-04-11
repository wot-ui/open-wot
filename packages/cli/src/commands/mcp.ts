import type { Command } from 'commander'

export function registerMcpCommand(program: Command): void {
  program.command('mcp')
    .description('Start the wot-ui MCP server')
    .action(async () => {
      const { startMcpServer } = await import('../mcp/server')
      await startMcpServer()
    })
}

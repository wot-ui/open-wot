import { join, resolve } from 'node:path'
import { clientCommandOutput, runClientCommand } from './client-command'
import { findExecutable } from './detect'
import { JsonMcpClientAdapter } from './json-adapter'

export const claudeAdapter = new JsonMcpClientAdapter({
  id: 'claude',
  displayName: 'Claude Code',
  executableNames: ['claude'],
  supportedScopes: ['project', 'user'],
  configPath: (context, scope) => scope === 'project'
    ? resolve(context.cwd, '.mcp.json')
    : join(context.homeDir, '.claude.json'),
  serverKey: 'mcpServers',
  verifyRegistration: async (context, _state, options) => {
    const executable = await findExecutable(['claude'], context)
    if (!executable) {
      return {
        status: 'unknown',
        message: 'Claude Code executable was not found; registration could not be verified',
        action: 'Open Claude Code in this project and inspect /mcp.',
      }
    }
    const result = await runClientCommand(executable, ['mcp', 'get', 'wot-ui'], { ...context, timeoutMs: options?.timeoutMs })
    const output = clientCommandOutput(result)
    const command = `${executable} mcp get wot-ui`
    if (result.timedOut || result.error) {
      return {
        status: 'failed',
        message: result.error || 'Claude Code registration check failed',
        action: 'Retry claude mcp get wot-ui and inspect the client process if it still fails.',
        command,
      }
    }
    if (/pending approval|approval.*pending|untrusted|not trusted|trust (?:this )?(?:project|workspace)/i.test(output)) {
      return {
        status: 'pending',
        message: 'Claude Code found wot-ui, but project approval is pending',
        action: 'Open Claude Code in this project and approve the wot-ui MCP server.',
        command,
      }
    }
    if (/rejected|disabled/i.test(output)) {
      return {
        status: 'failed',
        message: 'Claude Code has rejected or disabled the wot-ui MCP server',
        action: 'Open /mcp in Claude Code and enable or re-approve wot-ui.',
        command,
      }
    }
    if (result.exitCode === 0 && !result.timedOut) {
      return { status: 'ready', message: 'Claude Code recognizes the wot-ui MCP server', command }
    }
    return {
      status: 'failed',
      message: 'Claude Code did not recognize the wot-ui MCP server',
      action: 'Run claude mcp get wot-ui and inspect the configured scope.',
      command,
    }
  },
})

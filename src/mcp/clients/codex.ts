import { join, resolve } from 'node:path'
import { clientCommandOutput, runClientCommand } from './client-command'
import { findExecutable } from './detect'
import { TomlMcpClientAdapter } from './toml-adapter'
import { REQUIRED_WOT_MCP_TOOLS } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value as string[] : undefined
}

export const codexAdapter = new TomlMcpClientAdapter({
  id: 'codex',
  displayName: 'Codex',
  executableNames: ['codex'],
  supportedScopes: ['project', 'user'],
  configPath: (context, scope) => scope === 'project'
    ? resolve(context.cwd, '.codex', 'config.toml')
    : join(context.homeDir, '.codex', 'config.toml'),
  verifyRegistration: async (context, state, options) => {
    const executable = await findExecutable(['codex'], context)
    if (!executable) {
      return {
        status: 'unknown',
        message: 'Codex executable was not found; registration could not be verified',
        action: 'Open Codex in this project and inspect MCP server settings.',
      }
    }
    const result = await runClientCommand(executable, ['mcp', 'get', 'wot-ui', '--json'], { ...context, timeoutMs: options?.timeoutMs })
    const output = clientCommandOutput(result)
    const command = `${executable} mcp get wot-ui --json`
    if (result.timedOut || result.error) {
      return {
        status: 'failed',
        message: result.error || 'Codex registration check failed',
        action: 'Retry codex mcp get wot-ui --json and inspect the client process if it still fails.',
        command,
      }
    }
    if (result.exitCode === 0 && !result.timedOut) {
      try {
        const registration = JSON.parse(result.stdout) as unknown
        if (!isRecord(registration) || registration.name !== 'wot-ui')
          return { status: 'unknown', message: 'Codex returned an unreadable registration response', command }
        if (registration.enabled === false) {
          return {
            status: 'failed',
            message: 'Codex recognizes the wot-ui MCP server, but it is disabled',
            action: 'Enable the wot-ui MCP server in Codex and retry the doctor command.',
            command,
          }
        }
        const enabledTools = stringArray(registration.enabled_tools)
        const disabledTools = stringArray(registration.disabled_tools)
        const unavailableTools = REQUIRED_WOT_MCP_TOOLS.filter(tool =>
          (enabledTools !== undefined && !enabledTools.includes(tool)) || disabledTools?.includes(tool),
        )
        if (unavailableTools.length > 0) {
          return {
            status: 'failed',
            message: `Codex tool filters exclude required tools: ${unavailableTools.join(', ')}`,
            action: 'Update the wot-ui MCP tool filters in Codex and retry the doctor command.',
            command,
          }
        }
        return { status: 'ready', message: 'Codex recognizes the wot-ui MCP server', command }
      }
      catch {
        return { status: 'unknown', message: 'Codex returned an unreadable registration response', command }
      }
    }
    if (/pending approval|approval.*pending|untrusted|not trusted|trust (?:this )?(?:project|workspace)/i.test(output)) {
      return {
        status: 'pending',
        message: 'Codex requires project trust or MCP approval',
        action: 'Trust this project in Codex, restart it, and verify the wot-ui MCP server.',
        command,
      }
    }
    if (
      context.scope === 'project'
      && state.matches
      && /no mcp server named ["']?wot-ui["']? found/i.test(output)
    ) {
      return {
        status: 'pending',
        message: 'Codex is not loading the project-level wot-ui MCP configuration yet',
        action: 'Trust this project by opening it in Codex, then restart Codex and retry the doctor command.',
        command,
      }
    }
    return {
      status: 'failed',
      message: 'Codex did not recognize the wot-ui MCP server',
      action: 'Run codex mcp get wot-ui --json and inspect the configured scope.',
      command,
    }
  },
})

import type { Command } from 'commander'
import type { McpClientId, McpScope } from '../mcp/clients'
import process from 'node:process'
import { applyChangePlan, confirmChangePlan, formatChangePlan, mergeChangePlans, toPublicChangePlan } from '../application/change-plan'
import { doctorMcpClients, formatMcpDoctorReport, mcpDoctorExitCode, toPublicMcpDoctorReport } from '../application/mcp-doctor'
import { detectMcpClients, inspectMcpClients, planMcpInstall, planMcpRemove, printMcpConfig, toPublicClientConfigState } from '../application/mcp-onboarding'
import { isMcpClientId, isMcpScope } from '../mcp/clients'
import { writeJson, writeLine } from '../utils/output'
import { parsePositiveIntegerOption, printError } from './shared'

type OutputFormat = 'text' | 'json'

interface McpCommandOptions {
  client?: string
  scope?: string
  cwd?: string
  format?: string
  dryRun?: boolean
  yes?: boolean
  pin?: string | boolean
}

function outputFormat(value?: string): OutputFormat {
  return value === 'json' ? 'json' : 'text'
}

function parseClient(value: string | undefined, fallback: 'auto' | 'all' = 'auto'): McpClientId | 'auto' | 'all' {
  const client = value ?? fallback
  if (client === 'auto' || client === 'all' || isMcpClientId(client))
    return client
  throw new Error(`Unsupported MCP client "${client}". Use claude, cursor, vscode, codex, opencode, antigravity, auto, or all.`)
}

function parseScope(value?: string): McpScope {
  const scope = value ?? 'project'
  if (!isMcpScope(scope))
    throw new Error(`Unsupported scope "${scope}". Use project or user.`)
  return scope
}

function addCommonOptions(command: Command, defaultClient: 'auto' | 'all' = 'auto'): Command {
  return command
    .option('--client <client>', 'MCP client: auto, all, claude, cursor, vscode, codex, opencode, antigravity', defaultClient)
    .option('--scope <scope>', 'configuration scope: project or user', 'project')
    .option('--cwd <directory>', 'project directory', process.cwd())
    .option('--format <format>', 'output format: text or json', 'text')
    .option('--pin [version]', 'pin @wot-ui/cli to the current or specified version')
}

async function runSafely(options: McpCommandOptions, action: () => Promise<void>): Promise<void> {
  try {
    await action()
  }
  catch (error) {
    printError(error instanceof Error ? error.message : String(error), outputFormat(options.format))
    process.exitCode = 1
  }
}

async function startServer(): Promise<void> {
  const { startMcpServer } = await import('../mcp/server')
  await startMcpServer()
}

export function registerMcpCommand(program: Command): void {
  const mcp = program.command('mcp')
    .description('Start or manage the wot-ui MCP server')
    .action(startServer)

  mcp.command('serve')
    .description('Start the wot-ui MCP server explicitly')
    .action(startServer)

  addCommonOptions(mcp.command('init').description('Configure wot-ui MCP for an AI client'))
    .option('--dry-run', 'preview changes without writing files')
    .option('-y, --yes', 'apply changes without prompting')
    .action(async (options: McpCommandOptions) => runSafely(options, async () => {
      const client = parseClient(options.client)
      const scope = parseScope(options.scope)
      const plans = await planMcpInstall(client, { cwd: options.cwd, scope, pin: options.pin })
      const plan = mergeChangePlans('Initialize wot-ui MCP integration', plans)
      if (!options.dryRun) {
        if (!await confirmChangePlan(plan, { yes: options.yes, cwd: options.cwd })) {
          writeLine('Cancelled.')
          return
        }
        await applyChangePlan(plan)
      }
      if (outputFormat(options.format) === 'json')
        writeJson({ dryRun: Boolean(options.dryRun), plan: toPublicChangePlan(plan, options.cwd) })
      else
        writeLine(`${formatChangePlan(plan, options.cwd)}${options.dryRun ? '\nDry run: no files were changed.' : ''}`)
    }))

  mcp.command('list')
    .description('List supported MCP clients and detection results')
    .option('--cwd <directory>', 'project directory', process.cwd())
    .option('--format <format>', 'output format: text or json', 'text')
    .action(async (options: McpCommandOptions) => runSafely(options, async () => {
      const detections = await detectMcpClients({ cwd: options.cwd })
      if (outputFormat(options.format) === 'json')
        writeJson({ clients: detections })
      else
        writeLine(detections.map(item => `${item.installed ? 'detected' : 'not detected'} ${item.displayName} (${item.client})\n  ${item.configLocations.join('\n  ')}`).join('\n'))
    }))

  addCommonOptions(mcp.command('status').description('Inspect wot-ui MCP client configuration'), 'all')
    .action(async (options: McpCommandOptions) => runSafely(options, async () => {
      const states = await inspectMcpClients(parseClient(options.client, 'all'), {
        cwd: options.cwd,
        scope: parseScope(options.scope),
        pin: options.pin,
      })
      const publicStates = states.map(toPublicClientConfigState)
      if (outputFormat(options.format) === 'json')
        writeJson({ clients: publicStates })
      else
        writeLine(publicStates.map(state => `${state.matches ? 'ok' : state.configured ? 'mismatch' : 'missing'} ${state.displayName}: ${state.path}${state.problem ? `\n  ${state.problem}` : ''}`).join('\n'))
      if (states.some(state => !state.matches))
        process.exitCode = 1
    }))

  addCommonOptions(mcp.command('remove').description('Remove the managed wot-ui MCP configuration'))
    .option('--dry-run', 'preview changes without writing files')
    .option('-y, --yes', 'apply changes without prompting')
    .action(async (options: McpCommandOptions) => runSafely(options, async () => {
      const plans = await planMcpRemove(parseClient(options.client), {
        cwd: options.cwd,
        scope: parseScope(options.scope),
        pin: options.pin,
      })
      const plan = mergeChangePlans('Remove wot-ui MCP integration', plans)
      if (!options.dryRun) {
        if (!await confirmChangePlan(plan, { yes: options.yes, cwd: options.cwd })) {
          writeLine('Cancelled.')
          return
        }
        await applyChangePlan(plan)
      }
      if (outputFormat(options.format) === 'json')
        writeJson({ dryRun: Boolean(options.dryRun), plan: toPublicChangePlan(plan, options.cwd) })
      else
        writeLine(`${formatChangePlan(plan, options.cwd)}${options.dryRun ? '\nDry run: no files were changed.' : ''}`)
    }))

  addCommonOptions(mcp.command('doctor').description('Validate configuration and perform a real MCP handshake'))
    .option('--timeout <milliseconds>', 'total doctor timeout in milliseconds', '10000')
    .action(async (options: McpCommandOptions & { timeout?: string }) => runSafely(options, async () => {
      const reports = await doctorMcpClients(parseClient(options.client), {
        cwd: options.cwd,
        scope: parseScope(options.scope),
        pin: options.pin,
        timeoutMs: parsePositiveIntegerOption(options.timeout, 10_000, '--timeout'),
      })
      if (outputFormat(options.format) === 'json')
        writeJson({ clients: reports.map(toPublicMcpDoctorReport) })
      else
        writeLine(reports.map(formatMcpDoctorReport).join('\n'))
      const exitCode = mcpDoctorExitCode(reports)
      if (exitCode > 0)
        process.exitCode = exitCode
    }))

  addCommonOptions(mcp.command('print').description('Print the MCP configuration snippet'))
    .action(async (options: McpCommandOptions) => runSafely(options, async () => {
      const client = parseClient(options.client)
      if (client === 'auto' || client === 'all')
        throw new Error('mcp print requires one explicit client')
      const config = await printMcpConfig(client, { cwd: options.cwd, scope: parseScope(options.scope), pin: options.pin })
      if (outputFormat(options.format) === 'json')
        writeJson({ client, config })
      else
        writeLine(config)
    }))
}

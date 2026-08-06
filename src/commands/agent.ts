import type { Command } from 'commander'
import type { AgentCapability } from '../application/agent-onboarding'
import type { McpDoctorReport } from '../application/mcp-doctor'
import type { McpClientId, McpScope } from '../mcp/clients'
import process from 'node:process'
import { inspectAgentInstructions, inspectAgentSkill, planAgentInit, planAgentRemove } from '../application/agent-onboarding'
import { applyChangePlan, confirmChangePlan, formatChangePlan, mergeChangePlans, toPublicChangePlan } from '../application/change-plan'
import { doctorMcpClients, formatMcpDoctorReport, toPublicMcpDoctorReport } from '../application/mcp-doctor'
import { detectMcpClients, inspectMcpClients, resolveMcpAdapters, toPublicClientConfigState } from '../application/mcp-onboarding'
import { isMcpClientId, isMcpScope } from '../mcp/clients'
import { writeJson, writeLine } from '../utils/output'
import { parsePositiveIntegerOption, printError } from './shared'

interface AgentCommandOptions {
  client?: string
  scope?: string
  cwd?: string
  format?: string
  with?: string
  dryRun?: boolean
  yes?: boolean
  pin?: string | boolean
  timeout?: string
}

type CapabilityCheckStatus = 'pass' | 'fail' | 'skipped' | 'warning' | 'action-required'

interface CapabilityCheck {
  status: CapabilityCheckStatus
  [key: string]: unknown
}

interface AgentCapabilityReport {
  client: McpClientId
  capabilities: Record<AgentCapability, CapabilityCheck>
}

function parseCapabilities(value?: string): AgentCapability[] {
  const capabilities = (value ?? 'mcp,skill,instructions').split(',').map(item => item.trim()).filter(Boolean)
  const supported: AgentCapability[] = ['mcp', 'skill', 'instructions']
  if (capabilities.length === 0 || capabilities.some(item => !supported.includes(item as AgentCapability)))
    throw new Error('Unsupported --with value. Use mcp, skill, instructions, or a comma-separated combination.')
  return [...new Set(capabilities)] as AgentCapability[]
}

function parseScope(value?: string): McpScope {
  const scope = value ?? 'project'
  if (!isMcpScope(scope))
    throw new Error(`Unsupported scope "${scope}". Use project or user.`)
  return scope
}

function parseClient(value?: string): McpClientId | 'auto' | 'all' {
  const client = value ?? 'auto'
  if (client === 'auto' || client === 'all' || isMcpClientId(client))
    return client
  throw new Error(`Unsupported Agent client "${client}".`)
}

function addOptions(command: Command, defaultClient: 'auto' | 'all' = 'auto'): Command {
  return command
    .option('--client <client>', 'Agent client: auto, all, claude, cursor, vscode, codex, opencode, antigravity', defaultClient)
    .option('--scope <scope>', 'MCP configuration scope: project or user', 'project')
    .option('--with <capabilities>', 'capabilities: mcp,skill,instructions', 'mcp,skill,instructions')
    .option('--cwd <directory>', 'project directory', process.cwd())
    .option('--format <format>', 'output format: text or json', 'text')
    .option('--pin [version]', 'pin @wot-ui/cli to the current or specified version')
}

async function runSafely(options: AgentCommandOptions, action: () => Promise<void>): Promise<void> {
  try {
    await action()
  }
  catch (error) {
    printError(error instanceof Error ? error.message : String(error), options.format === 'json' ? 'json' : 'text')
    process.exitCode = 1
  }
}

async function resolveClients(options: AgentCommandOptions): Promise<McpClientId[]> {
  return (await resolveMcpAdapters(parseClient(options.client), {
    cwd: options.cwd,
    scope: parseScope(options.scope),
    pin: options.pin,
  })).map(adapter => adapter.id)
}

async function inspectCapabilities(client: McpClientId, capabilities: AgentCapability[], options: AgentCommandOptions): Promise<AgentCapabilityReport> {
  const projectDir = options.cwd ?? process.cwd()
  const [mcpStates, skill, instructions] = await Promise.all([
    capabilities.includes('mcp')
      ? inspectMcpClients(client, { cwd: options.cwd, scope: parseScope(options.scope), pin: options.pin })
      : Promise.resolve([]),
    capabilities.includes('skill') ? inspectAgentSkill(projectDir, client) : Promise.resolve(undefined),
    capabilities.includes('instructions') ? inspectAgentInstructions(projectDir, client) : Promise.resolve(undefined),
  ])
  const mcp = mcpStates[0]
  return {
    client,
    capabilities: {
      mcp: capabilities.includes('mcp')
        ? { status: mcp?.matches ? 'pass' : 'fail', state: mcp ? toPublicClientConfigState(mcp) : undefined }
        : { status: 'skipped' },
      skill: capabilities.includes('skill')
        ? { status: skill?.matches ? 'pass' : 'fail', installed: skill?.installed, matches: skill?.matches }
        : { status: 'skipped' },
      instructions: capabilities.includes('instructions')
        ? { status: instructions?.installed ? 'pass' : 'fail', installed: instructions?.installed }
        : { status: 'skipped' },
    },
  }
}

function reportFailed(report: AgentCapabilityReport): boolean {
  return Object.values(report.capabilities).some(capability => capability.status === 'fail')
}

function reportNeedsAction(report: AgentCapabilityReport): boolean {
  return Object.values(report.capabilities).some(capability => capability.status === 'action-required')
}

function reportHasWarning(report: AgentCapabilityReport): boolean {
  return Object.values(report.capabilities).some(capability => capability.status === 'warning')
}

function formatCapabilityReport(report: AgentCapabilityReport): string {
  const state = reportFailed(report)
    ? 'incomplete'
    : reportNeedsAction(report)
      ? 'action-required'
      : reportHasWarning(report)
        ? 'warning'
        : 'ok'
  const capabilities = Object.entries(report.capabilities)
    .map(([name, capability]) => `${name}=${capability.status}`)
    .join(' ')
  return `${state} ${report.client}: ${capabilities}`
}

export function registerAgentCommand(program: Command): void {
  const agent = program.command('agent').description('Connect AI agents to wot-ui MCP and Skills')

  addOptions(agent.command('init').description('Initialize MCP, Skill, and Agent instructions'))
    .option('--dry-run', 'preview changes without writing files')
    .option('-y, --yes', 'apply changes without prompting')
    .action(async (options: AgentCommandOptions) => runSafely(options, async () => {
      const clients = await resolveClients(options)
      const capabilities = parseCapabilities(options.with)
      const plans = await Promise.all(clients.map(client => planAgentInit({
        client,
        capabilities,
        cwd: options.cwd,
        scope: parseScope(options.scope),
        pin: options.pin,
      })))
      const plan = mergeChangePlans('Initialize wot-ui Agent integration', plans)
      if (!options.dryRun) {
        if (!await confirmChangePlan(plan, { yes: options.yes, cwd: options.cwd })) {
          writeLine('Cancelled.')
          return
        }
        await applyChangePlan(plan)
      }
      if (options.format === 'json')
        writeJson({ dryRun: Boolean(options.dryRun), plan: toPublicChangePlan(plan, options.cwd) })
      else
        writeLine(`${formatChangePlan(plan, options.cwd)}${options.dryRun ? '\nDry run: no files were changed.' : ''}`)
    }))

  agent.command('list')
    .description('List supported and detected AI clients')
    .option('--cwd <directory>', 'project directory', process.cwd())
    .option('--format <format>', 'output format: text or json', 'text')
    .action(async (options: AgentCommandOptions) => runSafely(options, async () => {
      const clients = await detectMcpClients({ cwd: options.cwd })
      if (options.format === 'json')
        writeJson({ clients })
      else
        writeLine(clients.map(client => `${client.installed ? 'detected' : 'not detected'} ${client.displayName} (${client.client})`).join('\n'))
    }))

  addOptions(agent.command('status').description('Inspect MCP, Skill, and instructions'), 'all')
    .action(async (options: AgentCommandOptions) => runSafely(options, async () => {
      const clients = await resolveClients(options)
      const capabilities = parseCapabilities(options.with)
      const reports = await Promise.all(clients.map(client => inspectCapabilities(client, capabilities, options)))
      if (options.format === 'json')
        writeJson({ clients: reports })
      else
        writeLine(reports.map(formatCapabilityReport).join('\n'))
      if (reports.some(reportFailed))
        process.exitCode = 1
    }))

  addOptions(agent.command('doctor').description('Validate Agent files and perform a real MCP handshake'))
    .option('--timeout <milliseconds>', 'total doctor timeout in milliseconds', '10000')
    .action(async (options: AgentCommandOptions) => runSafely(options, async () => {
      const clients = await resolveClients(options)
      const capabilities = parseCapabilities(options.with)
      const timeoutMs = parsePositiveIntegerOption(options.timeout, 10_000, '--timeout')
      const deadline = Date.now() + timeoutMs
      const reports: AgentCapabilityReport[] = []
      for (const client of clients) {
        const report = await inspectCapabilities(client, capabilities, options)
        const mcpCheck = report.capabilities.mcp
        if (mcpCheck.status !== 'skipped') {
          const [doctor] = await doctorMcpClients(client, {
            cwd: options.cwd,
            scope: parseScope(options.scope),
            pin: options.pin,
            timeoutMs: Math.max(1, deadline - Date.now()),
          })
          const status: CapabilityCheckStatus = doctor.overall === 'failed'
            ? 'fail'
            : doctor.overall === 'action-required'
              ? 'action-required'
              : doctor.overall === 'server-ready'
                ? 'warning'
                : 'pass'
          report.capabilities.mcp = { ...mcpCheck, status, doctor: toPublicMcpDoctorReport(doctor) }
        }
        reports.push(report)
      }
      if (options.format === 'json') {
        writeJson({ clients: reports })
      }
      else {
        const lines = reports.flatMap((report) => {
          const doctor = report.capabilities.mcp.doctor as McpDoctorReport | undefined
          return [formatCapabilityReport(report), ...(doctor ? [formatMcpDoctorReport(doctor)] : [])]
        })
        writeLine(lines.join('\n'))
      }
      if (reports.some(reportFailed))
        process.exitCode = 1
      else if (reports.some(reportNeedsAction))
        process.exitCode = 2
    }))

  addOptions(agent.command('remove').description('Remove managed MCP, Skill, and instructions'))
    .option('--dry-run', 'preview changes without writing files')
    .option('-y, --yes', 'apply changes without prompting')
    .action(async (options: AgentCommandOptions) => runSafely(options, async () => {
      const clients = await resolveClients(options)
      const capabilities = parseCapabilities(options.with)
      const plans = await Promise.all(clients.map(client => planAgentRemove({
        client,
        capabilities,
        cwd: options.cwd,
        scope: parseScope(options.scope),
        pin: options.pin,
      })))
      const plan = mergeChangePlans('Remove wot-ui Agent integration', plans)
      if (!options.dryRun) {
        if (!await confirmChangePlan(plan, { yes: options.yes, cwd: options.cwd })) {
          writeLine('Cancelled.')
          return
        }
        await applyChangePlan(plan)
      }
      if (options.format === 'json')
        writeJson({ dryRun: Boolean(options.dryRun), plan: toPublicChangePlan(plan, options.cwd) })
      else
        writeLine(`${formatChangePlan(plan, options.cwd)}${options.dryRun ? '\nDry run: no files were changed.' : ''}`)
    }))
}

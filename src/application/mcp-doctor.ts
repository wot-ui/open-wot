import type { ClientConfigState, ClientRegistrationState, McpClientId } from '../mcp/clients'
import type { McpHandshakeResult } from './mcp-handshake'
import type { McpOperationOptions } from './mcp-onboarding'
import { getMcpClientAdapter, REQUIRED_WOT_MCP_TOOLS } from '../mcp/clients'
import { redactSensitiveText } from '../utils/redaction'
import { verifyMcpHandshake } from './mcp-handshake'
import { createPlanContext, resolveMcpAdapters } from './mcp-onboarding'

export type DoctorCheckStatus = 'pass' | 'fail' | 'skipped'
export type McpDoctorOverallStatus = 'ready' | 'server-ready' | 'action-required' | 'failed'

export interface McpDoctorReport {
  client: McpClientId
  displayName: string
  overall: McpDoctorOverallStatus
  config: {
    status: DoctorCheckStatus
    state: ClientConfigState
  }
  handshake: {
    status: DoctorCheckStatus
    result?: McpHandshakeResult
    message?: string
  }
  clientRegistration: ClientRegistrationState
}

export function validateMcpHandshake(result: McpHandshakeResult): { status: DoctorCheckStatus, message?: string } {
  if (!result.ok)
    return { status: 'fail', message: result.error ? redactSensitiveText(result.error) : 'MCP handshake failed' }
  if (result.serverName !== 'wot-ui')
    return { status: 'fail', message: `Expected MCP server name "wot-ui", received "${result.serverName ?? '<missing>'}"` }
  const missingTools = REQUIRED_WOT_MCP_TOOLS.filter(tool => !result.tools.includes(tool))
  if (missingTools.length > 0)
    return { status: 'fail', message: `MCP server is missing required tools: ${missingTools.join(', ')}` }
  return { status: 'pass' }
}

function overallStatus(config: DoctorCheckStatus, handshake: DoctorCheckStatus, registration: ClientRegistrationState): McpDoctorOverallStatus {
  if (config === 'fail' || handshake === 'fail' || registration.status === 'failed')
    return 'failed'
  if (registration.status === 'pending')
    return 'action-required'
  if (registration.status === 'ready')
    return 'ready'
  return 'server-ready'
}

export async function doctorMcpClients(
  client: McpClientId | 'auto' | 'all',
  options: McpOperationOptions & { timeoutMs?: number } = {},
): Promise<McpDoctorReport[]> {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000)
  const adapters = await resolveMcpAdapters(client, options)
  const context = createPlanContext(options)
  const states = await Promise.all(adapters.map(adapter => adapter.inspect(context)))

  return Promise.all(adapters.map(async (adapter, index) => {
    const state = states[index]!
    const configStatus: DoctorCheckStatus = state.matches ? 'pass' : 'fail'
    if (!state.matches || !state.server) {
      const registration: ClientRegistrationState = {
        status: 'skipped',
        message: 'Client registration was not checked because the configuration is invalid or missing',
      }
      return {
        client: adapter.id,
        displayName: adapter.displayName,
        overall: 'failed' as const,
        config: { status: configStatus, state },
        handshake: { status: 'skipped' as const, message: state.problem ?? 'wot-ui MCP configuration is missing or differs from the expected definition' },
        clientRegistration: registration,
      }
    }

    const handshakeTimeoutMs = Math.max(1, deadline - Date.now())
    const handshakeResult = await verifyMcpHandshake(state.server, {
      cwd: context.cwd,
      env: context.env,
      platform: context.platform,
      timeoutMs: handshakeTimeoutMs,
    })
    const handshake = validateMcpHandshake(handshakeResult)
    const registrationTimeoutMs = deadline - Date.now()
    const registration: ClientRegistrationState = registrationTimeoutMs > 0
      ? await getMcpClientAdapter(adapter.id).verifyRegistration(context, state, { timeoutMs: registrationTimeoutMs })
      : {
          status: 'failed',
          message: `Doctor timed out after ${options.timeoutMs ?? 10_000}ms before client registration could be verified`,
          action: 'Retry with a larger --timeout value if the MCP server needs more time to start.',
        }
    return {
      client: adapter.id,
      displayName: adapter.displayName,
      overall: overallStatus(configStatus, handshake.status, registration),
      config: { status: configStatus, state },
      handshake: { ...handshake, result: handshakeResult },
      clientRegistration: registration,
    }
  }))
}

export function formatMcpDoctorReport(report: McpDoctorReport): string {
  const secretValues = Object.values(report.config.state.server?.env ?? {})
  const handshakeDetail = redactSensitiveText(report.handshake.result?.ok
    ? `${report.handshake.result.tools.length} tools, ${report.handshake.result.durationMs}ms${report.handshake.message ? `; ${report.handshake.message}` : ''}`
    : report.handshake.message ?? report.handshake.result?.error ?? 'not run', secretValues)
  return [
    `${report.overall} ${report.displayName} (${report.client})`,
    `  ${report.config.status} config: ${report.config.state.path}`,
    `  ${report.handshake.status} handshake: ${handshakeDetail}`,
    `  ${report.clientRegistration.status} client: ${redactSensitiveText(report.clientRegistration.message, secretValues)}`,
    ...(report.clientRegistration.action ? [`  action: ${report.clientRegistration.action}`] : []),
  ].join('\n')
}

export function mcpDoctorExitCode(reports: McpDoctorReport[]): number {
  if (reports.some(report => report.overall === 'failed'))
    return 1
  if (reports.some(report => report.overall === 'action-required'))
    return 2
  return 0
}

export function toPublicMcpDoctorReport(report: McpDoctorReport): McpDoctorReport {
  const secretValues = Object.values(report.config.state.server?.env ?? {})
  const handshakeResult = report.handshake.result
    ? {
        ...report.handshake.result,
        error: report.handshake.result.error ? redactSensitiveText(report.handshake.result.error, secretValues) : undefined,
        stderr: undefined,
      }
    : undefined
  return {
    ...report,
    config: {
      ...report.config,
      state: {
        ...report.config.state,
        server: undefined,
        problem: report.config.state.problem ? redactSensitiveText(report.config.state.problem, secretValues) : undefined,
      },
    },
    handshake: {
      ...report.handshake,
      message: report.handshake.message ? redactSensitiveText(report.handshake.message, secretValues) : undefined,
      result: handshakeResult,
    },
    clientRegistration: {
      ...report.clientRegistration,
      message: redactSensitiveText(report.clientRegistration.message, secretValues),
    },
  }
}

import type { ChangePlan, ClientConfigState, ClientDetection, DetectContext, McpClientAdapter, McpClientId, McpScope, McpServerDefinition, PlanContext } from '../mcp/clients'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import packageJson from '../../package.json'
import { getMcpClientAdapter, mcpClientAdapters } from '../mcp/clients'
import { redactSensitiveText } from '../utils/redaction'

export interface McpOperationOptions {
  cwd?: string
  homeDir?: string
  scope?: McpScope
  pin?: string | boolean
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

export function createMcpServerDefinition(pin?: string | boolean): McpServerDefinition {
  const version = typeof pin === 'string' ? pin : pin ? packageJson.version : undefined
  const packageSpec = version ? `${packageJson.name}@${version}` : packageJson.name
  return {
    command: 'npx',
    args: ['-y', packageSpec, 'mcp'],
  }
}

export function createDetectContext(options: McpOperationOptions = {}): DetectContext {
  return {
    cwd: resolve(options.cwd ?? process.cwd()),
    homeDir: options.homeDir ?? homedir(),
    env: options.env ?? process.env,
    platform: options.platform ?? process.platform,
  }
}

export function createPlanContext(options: McpOperationOptions = {}): PlanContext {
  return {
    ...createDetectContext(options),
    scope: options.scope ?? 'project',
    server: createMcpServerDefinition(options.pin),
  }
}

export async function detectMcpClients(options: McpOperationOptions = {}): Promise<ClientDetection[]> {
  const context = createDetectContext(options)
  return Promise.all(mcpClientAdapters.map(adapter => adapter.detect(context)))
}

export async function resolveMcpAdapters(client: McpClientId | 'auto' | 'all', options: McpOperationOptions = {}): Promise<McpClientAdapter[]> {
  if (client === 'all')
    return mcpClientAdapters.filter(adapter => adapter.supportedScopes.includes(options.scope ?? 'project'))
  if (client !== 'auto')
    return [getMcpClientAdapter(client)]

  const detections = await detectMcpClients(options)
  const detected = detections
    .filter(item => item.installed && item.supportedScopes.includes(options.scope ?? 'project'))
    .map(item => getMcpClientAdapter(item.client))
  if (detected.length === 0)
    throw new Error('No supported MCP client detected. Pass --client explicitly.')
  if (detected.length > 1)
    throw new Error(`Multiple MCP clients detected (${detected.map(item => item.id).join(', ')}). Pass --client or --client all.`)
  return detected
}

export async function inspectMcpClients(client: McpClientId | 'auto' | 'all', options: McpOperationOptions = {}): Promise<ClientConfigState[]> {
  const adapters = await resolveMcpAdapters(client, options)
  const context = createPlanContext(options)
  return Promise.all(adapters.map(adapter => adapter.inspect(context)))
}

export async function planMcpInstall(client: McpClientId | 'auto' | 'all', options: McpOperationOptions = {}): Promise<ChangePlan[]> {
  const adapters = await resolveMcpAdapters(client, options)
  const context = createPlanContext(options)
  return Promise.all(adapters.map(adapter => adapter.planInstall(context)))
}

export async function planMcpRemove(client: McpClientId | 'auto' | 'all', options: McpOperationOptions = {}): Promise<ChangePlan[]> {
  const adapters = await resolveMcpAdapters(client, options)
  const context = createPlanContext(options)
  return Promise.all(adapters.map(adapter => adapter.planRemove(context)))
}

export async function printMcpConfig(client: McpClientId, options: McpOperationOptions = {}): Promise<string> {
  const adapter = getMcpClientAdapter(client)
  return adapter.print(createPlanContext(options))
}

export function toPublicClientConfigState(state: ClientConfigState): ClientConfigState {
  const secretValues = Object.values(state.server?.env ?? {})
  return {
    ...state,
    server: undefined,
    problem: state.problem ? redactSensitiveText(state.problem, secretValues) : undefined,
  }
}

export const MCP_CLIENT_IDS = ['claude', 'cursor', 'vscode', 'codex'] as const
export const REQUIRED_WOT_MCP_TOOLS = ['wot_status', 'wot_list'] as const

export type McpClientId = typeof MCP_CLIENT_IDS[number]
export type McpScope = 'project' | 'user'
export type McpConfigFormat = 'jsonc' | 'toml'
export type McpManagementMethod = 'client-cli' | 'config-file'

export interface McpServerDefinition {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface DetectContext {
  cwd: string
  homeDir: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

export interface ClientDetection {
  client: McpClientId
  displayName: string
  installed: boolean
  executable?: string
  supportedScopes: McpScope[]
  configLocations: string[]
  preferredMethod: McpManagementMethod
}

export interface ClientConfigState {
  client: McpClientId
  displayName: string
  scope: McpScope
  path: string
  exists: boolean
  configured: boolean
  matches: boolean
  server?: McpServerDefinition
  problem?: string
}

export type ClientRegistrationStatus = 'ready' | 'pending' | 'failed' | 'unknown' | 'unsupported' | 'skipped'

export interface ClientRegistrationState {
  status: ClientRegistrationStatus
  message: string
  action?: string
  command?: string
}

export interface RegistrationCheckOptions {
  timeoutMs?: number
}

export interface PlanContext extends DetectContext {
  scope: McpScope
  server: McpServerDefinition
}

export interface PlannedFileChange {
  type: 'write-file' | 'delete-file'
  path: string
  /** Filesystem root that this change must remain inside after resolving symlinks. */
  allowedRoot: string
  before?: string
  after?: string
  reason: string
  /** Safe, intentionally limited lines that may be shown in terminal and JSON output. */
  preview?: string[]
}

export interface ChangePlan {
  id: string
  summary: string
  changes: PlannedFileChange[]
  warnings: string[]
  requiresConfirmation: boolean
}

export interface PublicPlannedFileChange {
  type: PlannedFileChange['type']
  path: string
  reason: string
  preview: string[]
}

export interface PublicChangePlan {
  id: string
  summary: string
  changes: PublicPlannedFileChange[]
  warnings: string[]
  requiresConfirmation: boolean
}

export interface ApplyResult {
  changed: boolean
  applied: PlannedFileChange[]
  rolledBack: boolean
}

export interface McpClientAdapter {
  readonly id: McpClientId
  readonly displayName: string
  readonly supportedScopes: McpScope[]

  detect: (context: DetectContext) => Promise<ClientDetection>
  inspect: (context: PlanContext) => Promise<ClientConfigState>
  planInstall: (context: PlanContext) => Promise<ChangePlan>
  planRemove: (context: PlanContext) => Promise<ChangePlan>
  print: (context: PlanContext) => Promise<string>
  verifyRegistration: (context: PlanContext, state: ClientConfigState, options?: RegistrationCheckOptions) => Promise<ClientRegistrationState>
}

export function isMcpClientId(value: string): value is McpClientId {
  return MCP_CLIENT_IDS.includes(value as McpClientId)
}

export function isMcpScope(value: string): value is McpScope {
  return value === 'project' || value === 'user'
}

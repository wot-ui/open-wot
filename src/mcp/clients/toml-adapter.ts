import type { ChangePlan, ClientConfigState, ClientDetection, ClientRegistrationState, DetectContext, McpClientAdapter, McpClientId, McpScope, McpServerDefinition, PlanContext, RegistrationCheckOptions } from './types'
import { access, readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { parse } from 'smol-toml'
import { findExecutable } from './detect'
import { REQUIRED_WOT_MCP_TOOLS } from './types'

const START = '# open-wot managed mcp server start'
const END = '# open-wot managed mcp server end'
const TABLE_PATTERN = /^\[mcp_servers\.(?:wot-ui|"wot-ui")\]\s*$/m
const CHILD_TABLE_PATTERN = /^\s*\[\[?\s*mcp_servers\s*\.\s*(?:wot-ui|"wot-ui")\s*\./m

interface TomlAdapterOptions {
  id: McpClientId
  displayName: string
  executableNames: string[]
  supportedScopes: McpScope[]
  configPath: (context: DetectContext, scope: McpScope) => string
  verifyRegistration?: (context: PlanContext, state: ClientConfigState, options?: RegistrationCheckOptions) => Promise<ClientRegistrationState>
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return undefined
    throw error
  }
}

function quoteToml(value: string): string {
  return JSON.stringify(value)
}

function createBlock(server: McpServerDefinition): string {
  const lines = [
    START,
    '[mcp_servers.wot-ui]',
    `command = ${quoteToml(server.command)}`,
    `args = [${server.args.map(quoteToml).join(', ')}]`,
  ]
  if (server.env && Object.keys(server.env).length > 0) {
    const env = Object.entries(server.env).map(([key, value]) => `${quoteToml(key)} = ${quoteToml(value)}`).join(', ')
    lines.push(`env = { ${env} }`)
  }
  lines.push(END)
  return lines.join('\n')
}

function serverPreview(server: McpServerDefinition): string[] {
  return [
    '+ mcp_servers.wot-ui',
    `  command: ${server.command}`,
    `  args: ${server.args.join(' ')}`,
    ...Object.keys(server.env ?? {}).map(key => `  env.${key}: [REDACTED]`),
  ]
}

function managedPattern(): RegExp {
  return new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
}

function parseTomlDocument(content: string, path: string): Record<string, unknown> {
  try {
    return parse(content) as Record<string, unknown>
  }
  catch (error) {
    throw new Error(`Invalid TOML in ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getServerEntry(config: Record<string, unknown>): unknown {
  const servers = config.mcp_servers
  return isRecord(servers) ? servers['wot-ui'] : undefined
}

interface ParsedTomlServer {
  server: McpServerDefinition
  enabled?: boolean
  enabledTools?: string[]
  disabledTools?: string[]
}

function optionalStringArray(value: unknown): string[] | undefined | null {
  if (value === undefined)
    return undefined
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value as string[] : null
}

function parseServer(entry: unknown): ParsedTomlServer | undefined {
  if (!isRecord(entry) || typeof entry.command !== 'string' || !Array.isArray(entry.args) || !entry.args.every(argument => typeof argument === 'string'))
    return undefined
  const env = entry.env
  if (env !== undefined && (!isRecord(env) || !Object.values(env).every(value => typeof value === 'string')))
    return undefined
  if (entry.enabled !== undefined && typeof entry.enabled !== 'boolean')
    return undefined
  const enabledTools = optionalStringArray(entry.enabled_tools)
  const disabledTools = optionalStringArray(entry.disabled_tools)
  if (enabledTools === null || disabledTools === null)
    return undefined
  return {
    server: {
      command: entry.command,
      args: entry.args as string[],
      ...(env === undefined ? {} : { env: env as Record<string, string> }),
    },
    ...(entry.enabled === undefined ? {} : { enabled: entry.enabled }),
    ...(enabledTools === undefined ? {} : { enabledTools }),
    ...(disabledTools === undefined ? {} : { disabledTools }),
  }
}

function serverProblem(actual: ParsedTomlServer | undefined): string | undefined {
  if (!actual)
    return 'The wot-ui entry is not a supported stdio server definition'
  if (actual.enabled === false)
    return 'The wot-ui MCP server is disabled in Codex'
  const missingEnabledTools = actual.enabledTools === undefined
    ? []
    : REQUIRED_WOT_MCP_TOOLS.filter(tool => !actual.enabledTools!.includes(tool))
  const disabledRequiredTools = actual.disabledTools === undefined
    ? []
    : REQUIRED_WOT_MCP_TOOLS.filter(tool => actual.disabledTools!.includes(tool))
  const unavailableTools = [...new Set([...missingEnabledTools, ...disabledRequiredTools])]
  if (unavailableTools.length > 0)
    return `The Codex tool filters exclude required tools: ${unavailableTools.join(', ')}`
  return undefined
}

function serverMatches(actual: ParsedTomlServer | undefined, expected: McpServerDefinition): boolean {
  return !serverProblem(actual)
    && actual?.server.command === expected.command
    && JSON.stringify(actual.server.args) === JSON.stringify(expected.args)
    && JSON.stringify(actual.server.env ?? {}) === JSON.stringify(expected.env ?? {})
}

function assertNoExternalChildTables(content: string, path: string): void {
  if (CHILD_TABLE_PATTERN.test(content))
    throw new Error(`Cannot safely manage nested mcp_servers.wot-ui TOML tables in ${path}; migrate them into the main server definition first`)
}

function assertManagedEntryOwnsServer(content: string, path: string): void {
  const managed = managedPattern().exec(content)?.[0]
  if (!managed)
    return
  const documentEntry = getServerEntry(parseTomlDocument(content, path))
  const managedEntry = getServerEntry(parseTomlDocument(managed, path))
  if (!isDeepStrictEqual(documentEntry, managedEntry))
    throw new Error(`Cannot safely manage mcp_servers.wot-ui settings outside the open-wot managed block in ${path}`)
}

function assertInstalledEntry(content: string, block: string, path: string): void {
  const documentEntry = getServerEntry(parseTomlDocument(content, path))
  const managedEntry = getServerEntry(parseTomlDocument(block, path))
  if (!isDeepStrictEqual(documentEntry, managedEntry))
    throw new Error(`Cannot safely install mcp_servers.wot-ui while external settings remain in ${path}`)
}

function replaceServerSection(content: string, block: string): string {
  const pattern = managedPattern()
  if (pattern.test(content))
    return content.replace(pattern, block)

  const tableMatch = TABLE_PATTERN.exec(content)
  if (tableMatch) {
    const start = tableMatch.index
    const remainder = content.slice(start + tableMatch[0].length)
    const nextTable = /\n\s*\[[^\]]+\]/.exec(remainder)
    const end = nextTable ? start + tableMatch[0].length + nextTable.index + 1 : content.length
    return `${content.slice(0, start)}${block}\n${content.slice(end)}`
  }

  if (!content)
    return `${block}\n`
  const separator = content.endsWith('\n') ? '' : '\n'
  return `${content}${separator}${block}\n`
}

function removeServerSection(content: string): string {
  const pattern = managedPattern()
  const match = pattern.exec(content)
  if (!match)
    return content
  let end = match.index + match[0].length
  if (content.startsWith('\r\n', end))
    end += 2
  else if (content.startsWith('\n', end))
    end += 1
  return `${content.slice(0, match.index)}${content.slice(end)}`
}

export class TomlMcpClientAdapter implements McpClientAdapter {
  readonly id: McpClientId
  readonly displayName: string
  readonly supportedScopes: McpScope[]
  private readonly options: TomlAdapterOptions

  constructor(options: TomlAdapterOptions) {
    this.options = options
    this.id = options.id
    this.displayName = options.displayName
    this.supportedScopes = options.supportedScopes
  }

  async detect(context: DetectContext): Promise<ClientDetection> {
    const configLocations = this.supportedScopes.map(scope => this.options.configPath(context, scope))
    const executable = await findExecutable(this.options.executableNames, context)
    const hasConfig = (await Promise.all(configLocations.map(path => access(path).then(() => true).catch(() => false)))).some(Boolean)
    return {
      client: this.id,
      displayName: this.displayName,
      installed: Boolean(executable) || hasConfig,
      ...(executable ? { executable } : {}),
      supportedScopes: this.supportedScopes,
      configLocations,
      preferredMethod: 'config-file' as const,
    }
  }

  async inspect(context: PlanContext): Promise<ClientConfigState> {
    const path = this.options.configPath(context, context.scope)
    const content = await readOptional(path)
    if (content === undefined) {
      return {
        client: this.id,
        displayName: this.displayName,
        scope: context.scope,
        path,
        exists: false,
        configured: false,
        matches: false,
      }
    }
    try {
      const entry = getServerEntry(parseTomlDocument(content, path))
      const parsedServer = parseServer(entry)
      const problem = entry === undefined ? undefined : serverProblem(parsedServer)
      return {
        client: this.id,
        displayName: this.displayName,
        scope: context.scope,
        path,
        exists: true,
        configured: entry !== undefined,
        matches: serverMatches(parsedServer, context.server),
        ...(parsedServer ? { server: parsedServer.server } : {}),
        ...(problem ? { problem } : {}),
      }
    }
    catch (error) {
      return {
        client: this.id,
        displayName: this.displayName,
        scope: context.scope,
        path,
        exists: true,
        configured: managedPattern().test(content) || TABLE_PATTERN.test(content),
        matches: false,
        problem: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async planInstall(context: PlanContext): Promise<ChangePlan> {
    const path = this.options.configPath(context, context.scope)
    const before = await readOptional(path)
    parseTomlDocument(before ?? '', path)
    assertNoExternalChildTables(before ?? '', path)
    assertManagedEntryOwnsServer(before ?? '', path)
    const block = createBlock(context.server)
    const after = replaceServerSection(before ?? '', block)
    assertInstalledEntry(after, block, path)
    return {
      id: `${this.id}-${context.scope}-install`,
      summary: `Configure wot-ui MCP for ${this.displayName}`,
      changes: before === after
        ? []
        : [{
            type: 'write-file',
            path,
            allowedRoot: context.scope === 'project' ? context.cwd : context.homeDir,
            before,
            after,
            reason: 'Add or update the managed mcp_servers.wot-ui TOML section',
            preview: serverPreview(context.server),
          }],
      warnings: [],
      requiresConfirmation: before !== after,
    }
  }

  async planRemove(context: PlanContext): Promise<ChangePlan> {
    const path = this.options.configPath(context, context.scope)
    const before = await readOptional(path)
    const beforeDocument = before === undefined ? undefined : parseTomlDocument(before, path)
    if (before !== undefined && managedPattern().test(before)) {
      assertNoExternalChildTables(before, path)
      assertManagedEntryOwnsServer(before, path)
    }
    const after = before === undefined ? undefined : removeServerSection(before)
    if (after !== undefined) {
      const afterDocument = parseTomlDocument(after, path)
      if (managedPattern().test(before!) && getServerEntry(afterDocument) !== undefined)
        throw new Error(`Cannot safely remove mcp_servers.wot-ui because external settings remain in ${path}`)
    }
    return {
      id: `${this.id}-${context.scope}-remove`,
      summary: `Remove wot-ui MCP from ${this.displayName}`,
      changes: before === undefined || before === after
        ? []
        : [{
            type: 'write-file',
            path,
            allowedRoot: context.scope === 'project' ? context.cwd : context.homeDir,
            before,
            after,
            reason: 'Remove only the open-wot managed TOML section',
            preview: ['- mcp_servers.wot-ui'],
          }],
      warnings: beforeDocument !== undefined && getServerEntry(beforeDocument) !== undefined && !managedPattern().test(before!)
        ? ['A non-managed wot-ui section was found and left unchanged.']
        : [],
      requiresConfirmation: before !== undefined && before !== after,
    }
  }

  async print(context: PlanContext): Promise<string> {
    return createBlock(context.server)
  }

  async verifyRegistration(context: PlanContext, state: ClientConfigState, options?: RegistrationCheckOptions): Promise<ClientRegistrationState> {
    if (this.options.verifyRegistration)
      return this.options.verifyRegistration(context, state, options)
    return {
      status: 'unsupported',
      message: `${this.displayName} does not expose a stable CLI registration status check`,
      action: `Restart ${this.displayName} and confirm wot-ui in its MCP server panel.`,
    }
  }
}

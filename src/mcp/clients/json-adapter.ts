import type { ParseError } from 'jsonc-parser'
import type { ChangePlan, ClientConfigState, ClientDetection, ClientRegistrationState, DetectContext, McpClientAdapter, McpClientId, McpScope, McpServerDefinition, PlanContext, RegistrationCheckOptions } from './types'
import { access, readFile } from 'node:fs/promises'
import { applyEdits, modify, parse, printParseErrorCode } from 'jsonc-parser'
import { findExecutable } from './detect'

interface JsonAdapterOptions {
  id: McpClientId
  displayName: string
  executableNames: string[]
  supportedScopes: McpScope[]
  configPath: (context: DetectContext, scope: McpScope) => string
  serverKey: 'mcpServers' | 'servers'
  serverProblem?: (entry: unknown) => string | undefined
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

function parseObject(content: string, path: string): Record<string, unknown> {
  const errors: ParseError[] = []
  const value = parse(content, errors, { allowTrailingComma: true, disallowComments: false }) as unknown
  if (errors.length > 0) {
    const first = errors[0]!
    throw new Error(`Invalid JSONC in ${path}: ${printParseErrorCode(first.error)} at offset ${first.offset}`)
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Expected an object in ${path}`)
  return value as Record<string, unknown>
}

function isStringMap(value: unknown): value is Record<string, string> {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(item => typeof item === 'string')
}

function isServerDefinition(value: unknown): value is McpServerDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const candidate = value as Record<string, unknown>
  const env = candidate.env
  return typeof candidate.command === 'string'
    && Array.isArray(candidate.args)
    && candidate.args.every(argument => typeof argument === 'string')
    && (env === undefined || isStringMap(env))
}

function serverMatches(actual: McpServerDefinition | undefined, expected: McpServerDefinition): boolean {
  return actual?.command === expected.command
    && JSON.stringify(actual.args) === JSON.stringify(expected.args)
    && JSON.stringify(actual.env ?? {}) === JSON.stringify(expected.env ?? {})
}

function serverPreview(server: McpServerDefinition, serverKey: string): string[] {
  return [
    `+ ${serverKey}.wot-ui`,
    `  command: ${server.command}`,
    `  args: ${server.args.join(' ')}`,
    ...Object.keys(server.env ?? {}).map(key => `  env.${key}: [REDACTED]`),
  ]
}

export class JsonMcpClientAdapter implements McpClientAdapter {
  readonly id: McpClientId
  readonly displayName: string
  readonly supportedScopes: McpScope[]
  private readonly options: JsonAdapterOptions

  constructor(options: JsonAdapterOptions) {
    this.options = options
    this.id = options.id
    this.displayName = options.displayName
    this.supportedScopes = options.supportedScopes
  }

  private assertScope(scope: McpScope): void {
    if (!this.supportedScopes.includes(scope))
      throw new Error(`${this.displayName} does not support ${scope} scope`)
  }

  async detect(context: DetectContext): Promise<ClientDetection> {
    const configLocations = this.supportedScopes.map(scope => this.options.configPath(context, scope))
    const executable = await findExecutable(this.options.executableNames, context)
    const hasConfig = (await Promise.all(configLocations.map(async (path) => {
      try {
        await access(path)
        return true
      }
      catch {
        return false
      }
    }))).some(Boolean)

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
    this.assertScope(context.scope)
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
      const config = parseObject(content || '{}', path)
      const servers = config[this.options.serverKey]
      const entry = servers && typeof servers === 'object' && !Array.isArray(servers)
        ? (servers as Record<string, unknown>)['wot-ui']
        : undefined
      const server = isServerDefinition(entry) ? entry : undefined
      const serverProblem = server ? this.options.serverProblem?.(entry) : undefined
      return {
        client: this.id,
        displayName: this.displayName,
        scope: context.scope,
        path,
        exists: true,
        configured: entry !== undefined,
        matches: !serverProblem && serverMatches(server, context.server),
        ...(server ? { server } : {}),
        ...(serverProblem
          ? { problem: serverProblem }
          : !server && entry !== undefined
              ? { problem: 'The wot-ui entry is not a supported stdio server definition' }
              : {}),
      }
    }
    catch (error) {
      return {
        client: this.id,
        displayName: this.displayName,
        scope: context.scope,
        path,
        exists: true,
        configured: false,
        matches: false,
        problem: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async planInstall(context: PlanContext): Promise<ChangePlan> {
    this.assertScope(context.scope)
    const path = this.options.configPath(context, context.scope)
    const before = await readOptional(path)
    const source = before?.trim() ? before : '{}\n'
    parseObject(source, path)
    const edits = modify(source, [this.options.serverKey, 'wot-ui'], context.server, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes('\r\n') ? '\r\n' : '\n' },
    })
    const after = applyEdits(source, edits)
    const unchanged = before !== undefined ? before === after : after === '{}\n'
    return {
      id: `${this.id}-${context.scope}-install`,
      summary: `Configure wot-ui MCP for ${this.displayName}`,
      changes: unchanged
        ? []
        : [{
            type: 'write-file',
            path,
            allowedRoot: context.scope === 'project' ? context.cwd : context.homeDir,
            before,
            after,
            reason: `Add or update mcp server "wot-ui" under ${this.options.serverKey}`,
            preview: serverPreview(context.server, this.options.serverKey),
          }],
      warnings: [],
      requiresConfirmation: !unchanged,
    }
  }

  async planRemove(context: PlanContext): Promise<ChangePlan> {
    this.assertScope(context.scope)
    const path = this.options.configPath(context, context.scope)
    const before = await readOptional(path)
    if (before === undefined) {
      return {
        id: `${this.id}-${context.scope}-remove`,
        summary: `Remove wot-ui MCP from ${this.displayName}`,
        changes: [],
        warnings: [],
        requiresConfirmation: false,
      }
    }
    parseObject(before || '{}', path)
    const after = applyEdits(before, modify(before, [this.options.serverKey, 'wot-ui'], undefined, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: before.includes('\r\n') ? '\r\n' : '\n' },
    }))
    return {
      id: `${this.id}-${context.scope}-remove`,
      summary: `Remove wot-ui MCP from ${this.displayName}`,
      changes: before === after
        ? []
        : [{
            type: 'write-file',
            path,
            allowedRoot: context.scope === 'project' ? context.cwd : context.homeDir,
            before,
            after,
            reason: 'Remove only the wot-ui MCP server entry',
            preview: [`- ${this.options.serverKey}.wot-ui`],
          }],
      warnings: [],
      requiresConfirmation: before !== after,
    }
  }

  async print(context: PlanContext): Promise<string> {
    this.assertScope(context.scope)
    return JSON.stringify({
      [this.options.serverKey]: {
        'wot-ui': context.server,
      },
    }, null, 2)
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

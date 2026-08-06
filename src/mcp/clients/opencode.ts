import type { ParseError } from 'jsonc-parser'
import type { ChangePlan, ClientConfigState, ClientDetection, ClientRegistrationState, DetectContext, McpClientAdapter, McpScope, McpServerDefinition, PlanContext, PlannedFileChange, RegistrationCheckOptions } from './types'
import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { applyEdits, modify, parse, printParseErrorCode } from 'jsonc-parser'
import { clientCommandOutput, runClientCommand } from './client-command'
import { findExecutable } from './detect'
import { REQUIRED_WOT_MCP_TOOLS } from './types'

interface OpenCodeServerDefinition {
  type: 'local'
  command: string[]
  enabled: boolean
  environment?: Record<string, string>
}

interface OpenCodeConfigSource {
  path: string
  content: string
  config: Record<string, unknown>
  serverEntry: unknown
  hasServerEntry: boolean
}

function userConfigRoot(context: DetectContext): string {
  const env = context.env ?? process.env
  return resolve(env.XDG_CONFIG_HOME || join(context.homeDir, '.config'))
}

function userConfigAllowedRoot(context: DetectContext): string {
  const env = context.env ?? process.env
  return env.XDG_CONFIG_HOME ? userConfigRoot(context) : context.homeDir
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

function configCandidates(context: DetectContext, scope: McpScope): string[] {
  if (scope === 'project') {
    return [
      resolve(context.cwd, 'opencode.json'),
      resolve(context.cwd, 'opencode.jsonc'),
      resolve(context.cwd, '.opencode', 'opencode.json'),
      resolve(context.cwd, '.opencode', 'opencode.jsonc'),
    ]
  }
  const directory = join(userConfigRoot(context), 'opencode')
  return [resolve(directory, 'opencode.json'), resolve(directory, 'opencode.jsonc')]
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getServerEntry(config: Record<string, unknown>): { present: boolean, value: unknown } {
  if (!isRecord(config.mcp))
    return { present: false, value: undefined }
  return {
    present: Object.prototype.hasOwnProperty.call(config.mcp, 'wot-ui'),
    value: config.mcp['wot-ui'],
  }
}

async function readConfigSources(context: DetectContext, scope: McpScope): Promise<OpenCodeConfigSource[]> {
  const sources: OpenCodeConfigSource[] = []
  for (const path of configCandidates(context, scope)) {
    const content = await readOptional(path)
    if (content === undefined)
      continue
    const config = parseObject(content || '{}', path)
    const entry = getServerEntry(config)
    sources.push({
      path,
      content,
      config,
      serverEntry: entry.value,
      hasServerEntry: entry.present,
    })
  }
  return sources
}

function selectConfigSource(sources: OpenCodeConfigSource[]): OpenCodeConfigSource | undefined {
  return sources.findLast(source => source.hasServerEntry) ?? sources.at(-1)
}

function mergeDeepValue(target: unknown, source: unknown): unknown {
  if (Array.isArray(source))
    return source.map(value => mergeDeepValue(undefined, value))
  if (!isRecord(source))
    return source

  const merged: Record<string, unknown> = {}
  if (isRecord(target)) {
    for (const [key, value] of Object.entries(target)) {
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype')
        merged[key] = mergeDeepValue(undefined, value)
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype')
      continue
    const hasExistingValue = Object.prototype.hasOwnProperty.call(merged, key)
    merged[key] = mergeDeepValue(hasExistingValue ? merged[key] : undefined, value)
  }
  return merged
}

function normalizePermission(value: unknown): unknown {
  return value === 'allow' || value === 'ask' || value === 'deny'
    ? { '*': value }
    : value
}

function mergeConfigSources(sources: OpenCodeConfigSource[]): Record<string, unknown> {
  return sources.reduce<Record<string, unknown>>((merged, source) => {
    const config = Object.prototype.hasOwnProperty.call(source.config, 'permission')
      ? { ...source.config, permission: normalizePermission(source.config.permission) }
      : source.config
    return mergeDeepValue(merged, config) as Record<string, unknown>
  }, {})
}

function globMatches(pattern: string, value: string): boolean {
  const expression = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${expression}$`).test(value)
}

function unavailableRequiredTools(config: Record<string, unknown>): string[] {
  const availability = new Map(REQUIRED_WOT_MCP_TOOLS.map(tool => [tool, true]))
  const filters = [
    isRecord(config.tools) ? config.tools : undefined,
    isRecord(config.permission) ? config.permission : undefined,
  ]
  for (const filter of filters) {
    if (!filter)
      continue
    for (const [pattern, setting] of Object.entries(filter)) {
      const enabled = typeof setting === 'boolean'
        ? setting
        : setting === 'deny'
          ? false
          : setting === 'allow' || setting === 'ask'
            ? true
            : undefined
      if (enabled === undefined)
        continue
      for (const tool of REQUIRED_WOT_MCP_TOOLS) {
        if (pattern === 'wot-ui' || globMatches(pattern, `wot-ui_${tool}`))
          availability.set(tool, enabled)
      }
    }
  }
  return REQUIRED_WOT_MCP_TOOLS.filter(tool => availability.get(tool) === false)
}

function isStringMap(value: unknown): value is Record<string, string> {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(item => typeof item === 'string')
}

function decodeServer(value: unknown): McpServerDefinition | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const candidate = value as Record<string, unknown>
  const command = candidate.command
  const environment = candidate.environment
  if (candidate.type !== 'local'
    || (candidate.enabled !== undefined && typeof candidate.enabled !== 'boolean')
    || candidate.enabled === false
    || !Array.isArray(command)
    || command.length === 0
    || !command.every(item => typeof item === 'string')
    || (environment !== undefined && !isStringMap(environment))) {
    return undefined
  }
  return {
    command: command[0] as string,
    args: command.slice(1) as string[],
    ...(environment === undefined ? {} : { env: environment }),
  }
}

function encodeServer(server: McpServerDefinition): OpenCodeServerDefinition {
  return {
    type: 'local',
    command: [server.command, ...server.args],
    enabled: true,
    ...(server.env ? { environment: server.env } : {}),
  }
}

function serverMatches(actual: McpServerDefinition | undefined, expected: McpServerDefinition): boolean {
  return actual?.command === expected.command
    && JSON.stringify(actual.args) === JSON.stringify(expected.args)
    && JSON.stringify(actual.env ?? {}) === JSON.stringify(expected.env ?? {})
}

export const opencodeAdapter: McpClientAdapter = {
  id: 'opencode',
  displayName: 'OpenCode',
  supportedScopes: ['project', 'user'],

  async detect(context): Promise<ClientDetection> {
    const configLocations = [
      ...configCandidates(context, 'project'),
      ...configCandidates(context, 'user'),
    ]
    const executable = await findExecutable(['opencode'], context)
    const hasConfig = (await Promise.all(configLocations.map(path => access(path).then(() => true).catch(() => false)))).some(Boolean)
    return {
      client: 'opencode',
      displayName: 'OpenCode',
      installed: Boolean(executable) || hasConfig,
      ...(executable ? { executable } : {}),
      supportedScopes: ['project', 'user'],
      configLocations,
      preferredMethod: 'config-file',
    }
  },

  async inspect(context): Promise<ClientConfigState> {
    let path = configCandidates(context, context.scope)[0]!
    try {
      const sources = await readConfigSources(context, context.scope)
      const selected = selectConfigSource(sources)
      if (!selected) {
        return {
          client: 'opencode',
          displayName: 'OpenCode',
          scope: context.scope,
          path,
          exists: false,
          configured: false,
          matches: false,
        }
      }
      path = selected.path
      const config = mergeConfigSources(sources)
      const entry = getServerEntry(config)
      const server = decodeServer(entry.value)
      const unavailableTools = unavailableRequiredTools(config)
      const problem = entry.present
        ? !server
            ? 'The wot-ui entry is not an enabled OpenCode local MCP server definition'
            : unavailableTools.length > 0
              ? `OpenCode tool filters exclude required tools: ${unavailableTools.join(', ')}`
              : undefined
        : undefined
      return {
        client: 'opencode',
        displayName: 'OpenCode',
        scope: context.scope,
        path,
        exists: true,
        configured: entry.present,
        matches: !problem && serverMatches(server, context.server),
        ...(server ? { server } : {}),
        ...(problem ? { problem } : {}),
      }
    }
    catch (error) {
      return {
        client: 'opencode',
        displayName: 'OpenCode',
        scope: context.scope,
        path,
        exists: true,
        configured: false,
        matches: false,
        problem: error instanceof Error ? error.message : String(error),
      }
    }
  },

  async planInstall(context): Promise<ChangePlan> {
    const sources = await readConfigSources(context, context.scope)
    const selected = selectConfigSource(sources)
    const path = selected?.path ?? configCandidates(context, context.scope)[0]!
    const before = selected?.content
    const source = before?.trim() ? before : '{}\n'
    parseObject(source, path)
    const after = applyEdits(source, modify(source, ['mcp', 'wot-ui'], encodeServer(context.server), {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes('\r\n') ? '\r\n' : '\n' },
    }))
    const unchanged = before !== undefined && before === after
    return {
      id: `opencode-${context.scope}-install`,
      summary: 'Configure wot-ui MCP for OpenCode',
      changes: unchanged
        ? []
        : [{
            type: 'write-file',
            path,
            allowedRoot: context.scope === 'project' ? context.cwd : userConfigAllowedRoot(context),
            before,
            after,
            reason: 'Add or update mcp.wot-ui as an OpenCode local server',
            preview: [
              '+ mcp.wot-ui',
              `  command: ${context.server.command} ${context.server.args.join(' ')}`,
              ...Object.keys(context.server.env ?? {}).map(key => `  environment.${key}: [REDACTED]`),
            ],
          }],
      warnings: [],
      requiresConfirmation: !unchanged,
    }
  },

  async planRemove(context): Promise<ChangePlan> {
    const sources = await readConfigSources(context, context.scope)
    const changes: PlannedFileChange[] = sources.flatMap((source) => {
      if (!source.hasServerEntry)
        return []
      const after = applyEdits(source.content, modify(source.content, ['mcp', 'wot-ui'], undefined, {
        formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.content.includes('\r\n') ? '\r\n' : '\n' },
      }))
      if (source.content === after)
        return []
      return [{
        type: 'write-file',
        path: source.path,
        allowedRoot: context.scope === 'project' ? context.cwd : userConfigAllowedRoot(context),
        before: source.content,
        after,
        reason: 'Remove only the wot-ui OpenCode MCP server entry',
        preview: ['- mcp.wot-ui'],
      }]
    })
    return {
      id: `opencode-${context.scope}-remove`,
      summary: 'Remove wot-ui MCP from OpenCode',
      changes,
      warnings: [],
      requiresConfirmation: changes.length > 0,
    }
  },

  async print(context): Promise<string> {
    return JSON.stringify({ mcp: { 'wot-ui': encodeServer(context.server) } }, null, 2)
  },

  async verifyRegistration(context: PlanContext, _state: ClientConfigState, options?: RegistrationCheckOptions): Promise<ClientRegistrationState> {
    const executable = await findExecutable(['opencode'], context)
    if (!executable) {
      return {
        status: 'unknown',
        message: 'OpenCode executable was not found; registration could not be verified',
        action: 'Open OpenCode in this project and inspect its MCP servers.',
      }
    }
    const result = await runClientCommand(executable, ['mcp', 'list'], { ...context, timeoutMs: options?.timeoutMs })
    const output = clientCommandOutput(result)
    const serverLine = output.split(/\r?\n/).find(line => /\bwot-ui\b/i.test(line))
    const command = `${executable} mcp list`
    if (result.timedOut || result.error) {
      return {
        status: 'failed',
        message: result.error || 'OpenCode registration check failed',
        action: 'Retry opencode mcp list and inspect the client process if it still fails.',
        command,
      }
    }
    if (serverLine && /pending approval|approval.*pending|untrusted|not trusted/i.test(serverLine)) {
      return {
        status: 'pending',
        message: 'OpenCode requires MCP approval',
        action: 'Approve the wot-ui MCP server in OpenCode and retry the doctor command.',
        command,
      }
    }
    if (serverLine && /not initialized|disabled|disconnected|failed|error|needs authentication|needs client registration/i.test(serverLine)) {
      return {
        status: 'failed',
        message: 'OpenCode recognizes the wot-ui MCP server, but it is not ready',
        action: 'Inspect wot-ui with opencode mcp list, then enable or repair the server.',
        command,
      }
    }
    if (result.exitCode === 0 && serverLine && /\bconnected\b/i.test(serverLine))
      return { status: 'ready', message: 'OpenCode recognizes the wot-ui MCP server', command }
    if (result.exitCode === 0 && serverLine) {
      return {
        status: 'unknown',
        message: 'OpenCode recognizes the wot-ui MCP server, but its connection status is unknown',
        action: 'Inspect wot-ui with opencode mcp list and confirm that it is connected.',
        command,
      }
    }
    return {
      status: 'failed',
      message: 'OpenCode did not recognize the wot-ui MCP server',
      action: 'Run opencode mcp list and inspect the configured scope.',
      command,
    }
  },
}

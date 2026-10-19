import type { ParseError } from 'jsonc-parser'
import type { ChangePlan, DetectContext, McpScope, PlanContext } from './types'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parse } from 'jsonc-parser'
import { JsonMcpClientAdapter } from './json-adapter'

function cliConfigPaths(context: DetectContext, scope: McpScope): string[] {
  return scope === 'project'
    ? [join(context.cwd, '.mcp.json'), join(context.cwd, 'mcp.json')]
    : [join(context.homeDir, '.codebuddy', '.mcp.json'), join(context.homeDir, '.codebuddy', 'mcp.json'), join(context.homeDir, '.codebuddy.json')]
}

async function cliConfigPath(context: DetectContext, scope: McpScope): Promise<string> {
  const paths = cliConfigPaths(context, scope)
  for (const path of paths) {
    try {
      await lstat(path)
      return path
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
    }
  }
  return paths[0]!
}

function serverProblem(value: unknown): string | undefined {
  const entry = value as Record<string, unknown>
  if (entry.disabled === true)
    return 'The wot-ui MCP server is disabled in CodeBuddy'
  if (entry.type !== undefined && entry.type !== 'stdio')
    return 'The CodeBuddy wot-ui server must use stdio transport'
  return undefined
}

const removeWarning = 'This MCP configuration may be shared by other clients; removing wot-ui affects those clients too.'

export const codebuddyAdapter = new JsonMcpClientAdapter({
  id: 'codebuddy',
  displayName: 'CodeBuddy IDE',
  executableNames: ['buddy'],
  supportedScopes: ['project', 'user'],
  configPath: (context, scope) => scope === 'project'
    ? join(context.cwd, '.mcp.json')
    : join(context.homeDir, '.codebuddy', 'mcp.json'),
  // The IDE user file is also a supported CLI legacy file, so it cannot identify the IDE.
  detectionPaths: () => [],
  serverKey: 'mcpServers',
  serverProblem,
  removeWarning,
})

export const codebuddyCliAdapter = new JsonMcpClientAdapter({
  id: 'codebuddy-cli',
  displayName: 'CodeBuddy Code CLI',
  executableNames: ['codebuddy', 'cbc'],
  supportedScopes: ['project', 'user'],
  configPath: cliConfigPath,
  detectionPaths: context => [join(context.homeDir, '.codebuddy', '.mcp.json'), join(context.homeDir, '.codebuddy.json')],
  serverKey: 'mcpServers',
  serverProblem,
  removeWarning,
  verifyRegistration: async () => ({
    status: 'unsupported',
    message: 'CodeBuddy CLI registration has not been verified by open-wot',
    action: 'Run codebuddy mcp get wot-ui in this project, then use /mcp and approve the project server if prompted.',
  }),
})

export async function reconcileCodebuddyConfigPlans(plans: ChangePlan[], context: PlanContext): Promise<void> {
  const paths = cliConfigPaths(context, context.scope)
  const created = plans.flatMap(plan => plan.changes)
    .filter(change => change.type === 'write-file' && change.before === undefined && paths.includes(change.path))
  if (created.length === 0)
    return
  const existing = await cliConfigPath(context, context.scope)
  const shadowing = created.find(change => paths.indexOf(change.path) < paths.indexOf(existing))
  if (shadowing) {
    const errors: ParseError[] = []
    const content = await readFile(existing, 'utf8')
    const config = parse(content.trim() ? content : '{}', errors, { allowTrailingComma: true }) as unknown
    if (errors.length || !config || typeof config !== 'object' || Array.isArray(config))
      throw new Error(`Cannot check CodeBuddy CLI configuration ${existing}: expected a valid JSONC object. Repair or move that file before retrying.`)
    const servers = (config as Record<string, unknown>).mcpServers
    const identicalWotOnly = servers && typeof servers === 'object' && !Array.isArray(servers)
      && Object.keys(servers).length === 1
      && isDeepStrictEqual((servers as Record<string, unknown>)['wot-ui'], context.server)
    // Unrelated JSON files and empty server maps have no MCP registrations to hide.
    if (identicalWotOnly || servers === undefined || (servers && typeof servers === 'object' && !Array.isArray(servers) && Object.keys(servers).length === 0)) {
      // In an all-client install the new shared file already contains wot-ui.
      // Do not also add it to the now-inactive legacy file, where removal would miss it.
      for (const plan of plans) {
        plan.changes = plan.changes.filter(change => change.path !== existing)
        plan.requiresConfirmation = plan.changes.length > 0
      }
      if (identicalWotOnly) {
        // Relocate the identical entry atomically, otherwise a later remove would
        // leave wot-ui behind in the inactive legacy file.
        const migration = await codebuddyCliAdapter.planRemove(context)
        if (migration.changes.length !== 1 || migration.changes[0]!.path !== existing || migration.changes[0]!.before !== content)
          throw new Error(`CodeBuddy CLI configuration ${existing} changed while planning migration. Retry the command.`)
        migration.summary = 'Remove the identical legacy wot-ui entry after migration'
        plans.push(migration)
      }
      return
    }
    throw new Error(`Refusing to create ${shadowing.path}: it would hide existing CodeBuddy CLI configuration ${existing}. Merge or migrate its mcpServers into ${shadowing.path} before retrying.`)
  }
}

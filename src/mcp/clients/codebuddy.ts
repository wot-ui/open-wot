import type { ChangePlan, DetectContext, McpScope, PlanContext } from './types'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
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

export async function assertNoCodebuddyConfigShadowing(plans: ChangePlan[], context: PlanContext): Promise<void> {
  const paths = cliConfigPaths(context, context.scope)
  const created = plans.flatMap(plan => plan.changes)
    .filter(change => change.type === 'write-file' && change.before === undefined && paths.includes(change.path))
  if (created.length === 0)
    return
  const existing = await cliConfigPath(context, context.scope)
  const shadowing = created.find(change => paths.indexOf(change.path) < paths.indexOf(existing))
  if (shadowing) {
    throw new Error(`Refusing to create ${shadowing.path}: it would hide existing CodeBuddy CLI configuration ${existing}. Merge or migrate that configuration before retrying, or use --client codebuddy-cli to keep its existing path.`)
  }
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

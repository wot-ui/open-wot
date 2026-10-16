import type { ChangePlan, ClientConfigState, DetectContext, McpClientAdapter, PlanContext } from './types'
import { access, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { editDeepseekConfig, inspectDeepseekConfig, printDeepseekConfig } from './deepseek-config'
import { findExecutable } from './detect'

function dshHome(context: DetectContext): string {
  const override = (context.env ?? process.env).DSH_HOME
  let path = override?.trim() ? override : join(context.homeDir, '.dsh')
  if (path === '~' || path.startsWith('~/') || path.startsWith('~\\'))
    path = join(context.homeDir, path.slice(2))
  return resolve(context.cwd, path)
}

function configPath(context: DetectContext): string {
  return join(dshHome(context), 'cordis.patch.yml')
}

function assertScope(context: PlanContext): void {
  if (context.scope !== 'user')
    throw new Error('DeepSeek Harness does not support project scope. Use --client deepseek --scope user.')
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

async function plan(context: PlanContext, remove: boolean): Promise<ChangePlan> {
  assertScope(context)
  const path = configPath(context)
  const before = await readOptional(path)
  const after = editDeepseekConfig(before ?? '', remove ? undefined : context.server)
  const changed = (before ?? '') !== after
  return {
    id: `deepseek-user-${remove ? 'remove' : 'install'}`,
    summary: `${remove ? 'Remove' : 'Configure'} wot-ui MCP for DeepSeek Harness`,
    changes: changed
      ? [{
          type: 'write-file',
          path,
          allowedRoot: dshHome(context),
          before,
          after,
          reason: `${remove ? 'Remove' : 'Configure'} only the open-wot-mcp plugin entry`,
          preview: [`${remove ? '-' : '+'} open-wot-mcp (wot-ui, stdio)`, ...remove ? [] : [`  command: ${context.server.command}`, `  args: ${context.server.args.join(' ')}`]],
        }]
      : [],
    warnings: ['The DeepSeek user patch layer is shared by all profiles that load it. Custom and minimal profiles may not provide all required capabilities.'],
    requiresConfirmation: changed,
  }
}

export const deepseekAdapter: McpClientAdapter = {
  id: 'deepseek',
  displayName: 'DeepSeek Harness',
  supportedScopes: ['user'],
  async detect(context) {
    const path = configPath(context)
    const executable = await findExecutable(['dsh'], context)
    const exists = await access(path).then(() => true).catch(() => false)
    return { client: this.id, displayName: this.displayName, installed: Boolean(executable) || exists, ...(executable ? { executable } : {}), supportedScopes: this.supportedScopes, configLocations: [path], preferredMethod: 'config-file' }
  },
  async inspect(context) {
    assertScope(context)
    const path = configPath(context)
    const content = await readOptional(path)
    const state: ClientConfigState = { client: this.id, displayName: this.displayName, scope: context.scope, path, exists: content !== undefined, configured: false, matches: false }
    try {
      const server = inspectDeepseekConfig(content ?? '')
      return { ...state, configured: Boolean(server), matches: Boolean(server) && JSON.stringify(server) === JSON.stringify(context.server), ...(server ? { server } : {}) }
    }
    catch (error) {
      return { ...state, problem: error instanceof Error ? error.message : 'Invalid DeepSeek configuration' }
    }
  },
  planInstall: context => plan(context, false),
  planRemove: context => plan(context, true),
  async print(context) {
    assertScope(context)
    return printDeepseekConfig(context.server)
  },
  async verifyRegistration() {
    return {
      status: 'unsupported',
      message: 'DeepSeek runtime registration has not been verified; a successful handshake only verifies the server.',
      action: 'Open a DeepSeek Harness standard-mode session in this project, reload or restart its configuration, and confirm wot_status and wot_list can be called. Also load wot-ui-v2 and check AGENTS.md instructions.',
    }
  },
}

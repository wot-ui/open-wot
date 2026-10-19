import type { DetectContext } from './types'
import { Buffer } from 'node:buffer'
import { open, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { findExecutable } from './detect'
import { JsonMcpClientAdapter } from './json-adapter'
import { REQUIRED_WOT_MCP_TOOLS } from './types'

function cliUserDirectory(context: DetectContext): string {
  return context.env?.QODER_CONFIG_DIR ? resolve(context.cwd, context.env.QODER_CONFIG_DIR) : join(context.homeDir, '.qoder')
}

async function qoderExecutable(context: DetectContext, cli: boolean): Promise<string | undefined> {
  if (cli) {
    const executable = await findExecutable(['qodercli'], context)
    if (executable)
      return executable
  }
  const executable = await findExecutable(['qoder'], context)
  if (!executable)
    return undefined
  // Both products ship a qoder command. Inspect the launcher without executing it.
  try {
    const path = await realpath(executable)
    const file = await open(path, 'r')
    let source: string
    try {
      const buffer = Buffer.alloc(8192)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      source = buffer.subarray(0, bytesRead).toString('utf8')
    }
    finally {
      await file.close()
    }
    const ide = /qoder(?:-ide)?\.app[/\\]|[/\\]qoder-ide[/\\]/i.test(path)
      || /ELECTRON_RUN_AS_NODE|VSCODE_PATH|out[/\\]cli\.js/.test(source)
    return ide !== cli ? executable : undefined
  }
  catch {
    return undefined
  }
}

function serverProblem(value: unknown): string | undefined {
  const entry = value as Record<string, unknown>
  if (entry.disabled === true)
    return 'The wot-ui MCP server is disabled in Qoder'
  if (entry.type !== undefined && entry.type !== 'stdio')
    return 'The Qoder wot-ui server must use stdio transport'
  for (const tool of REQUIRED_WOT_MCP_TOOLS) {
    if ((Array.isArray(entry.excludeTools) && entry.excludeTools.includes(tool))
      || (Array.isArray(entry.includeTools) && !entry.includeTools.includes(tool))) {
      return `Qoder filters required wot-ui tool: ${tool}`
    }
  }
  return undefined
}

const removeWarning = 'This MCP configuration may be shared by other clients; removing wot-ui affects those clients too.'

export const qoderAdapter = new JsonMcpClientAdapter({
  id: 'qoder',
  displayName: 'Qoder IDE',
  executableNames: [],
  detectExecutable: context => qoderExecutable(context, false),
  supportedScopes: ['project', 'user'],
  configPath: (context, scope) => scope === 'project' ? join(context.cwd, '.mcp.json') : join(context.homeDir, '.qoder', 'mcp.json'),
  detectionPaths: context => [join(context.cwd, '.qoder', 'mcp.json'), join(context.homeDir, '.qoder', 'mcp.json')],
  serverKey: 'mcpServers',
  serverProblem,
  removeWarning,
})

export const qoderCliAdapter = new JsonMcpClientAdapter({
  id: 'qoder-cli',
  displayName: 'Qoder CLI',
  executableNames: [],
  detectExecutable: context => qoderExecutable(context, true),
  supportedScopes: ['project', 'user'],
  configPath: (context, scope) => scope === 'project' ? join(context.cwd, '.mcp.json') : join(cliUserDirectory(context), 'settings.json'),
  allowedRoot: context => context.scope === 'project' ? context.cwd : cliUserDirectory(context),
  detectionPaths: context => [join(cliUserDirectory(context), 'settings.json')],
  serverKey: 'mcpServers',
  serverProblem,
  removeWarning,
  verifyRegistration: async () => ({
    status: 'unsupported',
    message: 'Qoder CLI registration has not been verified by open-wot',
    action: 'Run qoder mcp list in this project, then use /mcp reload and approve the project server if prompted.',
  }),
})

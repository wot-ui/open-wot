import type { ChangePlan, ClientConfigState, McpServerDefinition, PlanContext, PlannedFileChange } from './types'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { declarationPath, digest, installRoot, parseDeclaration, readDeclaration } from '../../../runtime/deepseek-project-bridge.mjs'
import { inspectDeepseekConfig } from './deepseek-config'
import { desktopCompatibilityProblem } from './deepseek-desktop'
import { editProjectBridge, inspectProjectBridge } from './deepseek-project-config'

export async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return undefined
    throw error
  }
}
export function bridgePath(home: string): string {
  return join(home, 'open-wot/project-bridge.mjs')
}
export function printProject(server: McpServerDefinition): string {
  const source = `${JSON.stringify({ schemaVersion: 1, server }, null, 2)}\n`
  parseDeclaration(source)
  return source
}
async function bundledBridge(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url))
  for (const path of [join(here, '../runtime/deepseek-project-bridge.mjs'), join(here, '../../../runtime/deepseek-project-bridge.mjs')]) {
    const source = await readOptional(path)
    if (source !== undefined)
      return source
  }
  throw new Error('Missing packaged DeepSeek bridge; reinstall @wot-ui/cli')
}
export async function planProject(context: PlanContext, home: string, remove: boolean): Promise<ChangePlan> {
  const root = await installRoot(context.cwd)
  const path = join(root, declarationPath)
  const patchPath = join(home, 'cordis.patch.yml')
  const bridge = bridgePath(home)
  const [before, patchBefore, bridgeBefore] = await Promise.all([readOptional(path), readOptional(patchPath), readOptional(bridge)])
  const global = inspectDeepseekConfig(patchBefore ?? '')
  if (!remove && global)
    throw new Error('Global wot-ui conflicts with project isolation. Run wot mcp remove --client deepseek --scope user, then initialize this project again.')
  const existing = inspectProjectBridge(patchBefore ?? '', bridge)
  const registered = existing?.projects.find(project => project.root === root)
  const changes: PlannedFileChange[] = []
  const warnings = ['Reload or restart DeepSeek after first installing the bridge; reopen project sessions after changes. Each machine and moved project needs its own init registration.']
  function change(path: string, allowedRoot: string, before: string | undefined, after: string | undefined, reason: string): void {
    if (before === after)
      return
    changes.push({ type: after === undefined ? 'delete-file' : 'write-file', path, allowedRoot, before, after, reason })
  }
  const projects = existing?.projects.filter(project => project.root !== root) ?? []
  if (remove) {
    if (before !== undefined) {
      if (registered && digest(before) === registered.digest)
        change(path, root, before, undefined, 'Remove registered project declaration')
      else warnings.push('Preserved modified or unregistered project declaration; remove it manually if no longer needed.')
    }
    if (registered) {
      change(patchPath, home, patchBefore, editProjectBridge(patchBefore ?? '', bridge, projects.length ? { ...existing!, projects } : undefined), 'Unregister only this project')
      if (!projects.length && bridgeBefore !== undefined) {
        if (digest(bridgeBefore) === existing!.bridgeHash)
          change(bridge, home, bridgeBefore, undefined, 'Remove unused managed project bridge')
        else warnings.push('Preserved modified shared bridge file.')
      }
    }
  }
  else {
    if (before !== undefined)
      await readDeclaration(root)
    if (bridgeBefore !== undefined && (!existing || digest(bridgeBefore) !== existing.bridgeHash))
      throw new Error('Modified or unmanaged DeepSeek bridge; preserve it and resolve the shared file manually')
    const source = await bundledBridge()
    // Preserve formatting on an unchanged declaration, including its registered digest.
    const after = before !== undefined && JSON.stringify(parseDeclaration(before).server) === JSON.stringify(context.server) ? before : printProject(context.server)
    const registration = { root, digest: digest(after) }
    const next = existing?.projects.map(project => project.root === root ? registration : project) ?? []
    if (!registered)
      next.push(registration)
    change(path, root, before, after, `Configure project wot-ui: ${context.server.args[1]}`)
    change(bridge, home, bridgeBefore, source, 'Install standalone project bridge in stable user directory')
    change(patchPath, home, patchBefore, editProjectBridge(patchBefore ?? '', bridge, { schemaVersion: 1, bridgeHash: digest(source), projects: next }), 'Register this project for automatic per-session loading')
  }
  return { id: `deepseek-project-${remove ? 'remove' : 'install'}`, summary: `${remove ? 'Remove' : 'Configure'} DeepSeek project MCP`, changes, warnings, requiresConfirmation: changes.length > 0 }
}
export async function inspectProject(context: PlanContext, home: string): Promise<ClientConfigState> {
  const path = join(context.cwd, declarationPath)
  const state: ClientConfigState = { client: 'deepseek', displayName: 'DeepSeek Harness', scope: 'project', path, exists: false, configured: false, matches: false }
  try {
    const root = await installRoot(context.cwd)
    const compatibility = await desktopCompatibilityProblem(context)
    if (compatibility)
      throw new Error(compatibility)
    state.exists = await readOptional(path) !== undefined
    const patch = await readOptional(join(home, 'cordis.patch.yml')) ?? ''
    if (inspectDeepseekConfig(patch))
      throw new Error('Global wot-ui conflicts with project isolation; remove the user MCP registration first')
    const registry = inspectProjectBridge(patch, bridgePath(home))
    if (!state.exists && !registry?.projects.some(project => project.root === root))
      return state
    const { source, declaration } = await readDeclaration(root)
    state.configured = true
    const registered = registry?.projects.find(project => project.root === root)
    if (!registered || registered.digest !== digest(source))
      throw new Error('Missing or stale project registration; run wot agent init --client deepseek')
    const bridge = await readOptional(bridgePath(home))
    if (!bridge || digest(bridge) !== registry!.bridgeHash || bridge !== await bundledBridge())
      throw new Error('Missing, modified or outdated DeepSeek bridge; run init to repair or upgrade')
    return { ...state, server: declaration.server, matches: JSON.stringify(declaration.server) === JSON.stringify(context.server) }
  }
  catch (error) { return { ...state, problem: error instanceof Error ? error.message : 'Invalid DeepSeek project configuration' } }
}

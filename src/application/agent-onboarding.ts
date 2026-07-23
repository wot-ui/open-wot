import type { ChangePlan, McpClientId, McpScope, PlannedFileChange } from '../mcp/clients'
import type { McpOperationOptions } from './mcp-onboarding'
import { existsSync } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { mergeChangePlans } from './change-plan'
import { createDetectContext, planMcpInstall, planMcpRemove } from './mcp-onboarding'

export type AgentCapability = 'mcp' | 'skill' | 'instructions'

const INSTRUCTIONS_START = '<!-- open-wot agent instructions start -->'
const INSTRUCTIONS_END = '<!-- open-wot agent instructions end -->'

interface ManagedInstructionsRange {
  start: number
  end: number
}

function findManagedInstructionsRange(content: string): ManagedInstructionsRange | undefined {
  const start = content.indexOf(INSTRUCTIONS_START)
  const endMarker = content.indexOf(INSTRUCTIONS_END)
  if (start === -1 && endMarker === -1)
    return undefined
  const hasDuplicateStart = start !== -1 && content.includes(INSTRUCTIONS_START, start + INSTRUCTIONS_START.length)
  const hasDuplicateEnd = endMarker !== -1 && content.includes(INSTRUCTIONS_END, endMarker + INSTRUCTIONS_END.length)
  if (start === -1 || endMarker === -1 || endMarker < start || hasDuplicateStart || hasDuplicateEnd)
    throw new Error('Malformed open-wot Agent instructions markers; expected exactly one ordered start/end pair')
  return { start, end: endMarker + INSTRUCTIONS_END.length }
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true).catch(() => false)
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

export function getSkillTarget(projectDir: string, client: McpClientId): string {
  return client === 'claude'
    ? resolve(projectDir, '.claude', 'skills', 'wot-ui-v2')
    : resolve(projectDir, '.agents', 'skills', 'wot-ui-v2')
}

export function getInstructionsTarget(projectDir: string, client: McpClientId): string {
  return resolve(projectDir, client === 'claude' ? 'CLAUDE.md' : 'AGENTS.md')
}

export function createAgentInstructions(client: McpClientId): string {
  const skill = client === 'claude' ? '.claude/skills/wot-ui-v2/SKILL.md' : '.agents/skills/wot-ui-v2/SKILL.md'
  return [
    INSTRUCTIONS_START,
    '## Wot UI Agent Instructions',
    '',
    `Before generating or modifying wot-ui component code, read the project Skill at \`${skill}\` and query the configured \`wot-ui\` MCP server for version-accurate APIs and examples.`,
    '',
    INSTRUCTIONS_END,
  ].join('\n')
}

export function updateManagedInstructions(content: string, block: string): string {
  const range = findManagedInstructionsRange(content)
  if (range)
    return `${content.slice(0, range.start)}${block}${content.slice(range.end)}`
  if (!content)
    return `${block}\n`
  const separator = content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n'
  return `${content}${separator}${block}\n`
}

export function removeManagedInstructions(content: string): string {
  const range = findManagedInstructionsRange(content)
  if (!range)
    return content
  return `${content.slice(0, range.start)}${content.slice(range.end)}`
}

export function resolveBundledWotSkill(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(here, '../../skills/wot-ui-v2'),
    resolve(here, '../skills/wot-ui-v2'),
    resolve(process.cwd(), 'skills/wot-ui-v2'),
  ]
  const found = candidates.find(path => existsSync(join(path, 'SKILL.md')))
  if (!found)
    throw new Error('Bundled wot-ui-v2 Skill not found')
  return found
}

async function listFiles(root: string, current = root): Promise<string[]> {
  if (!await exists(current))
    return []
  const entries = await readdir(current, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (entry.name === '.DS_Store')
      continue
    const path = join(current, entry.name)
    if (entry.isDirectory())
      files.push(...await listFiles(root, path))
    else if (entry.isFile())
      files.push(relative(root, path))
  }
  return files.sort()
}

async function planSkillInstall(projectDir: string, client: McpClientId): Promise<ChangePlan> {
  const source = resolveBundledWotSkill()
  const target = getSkillTarget(projectDir, client)
  const changes: PlannedFileChange[] = []
  const warnings: string[] = []
  for (const file of await listFiles(source)) {
    const sourcePath = join(source, file)
    const targetPath = join(target, file)
    const before = await readOptional(targetPath)
    const after = await readFile(sourcePath, 'utf8')
    if (before !== undefined && before !== after) {
      warnings.push(`Modified Skill file left unchanged: ${targetPath}`)
      continue
    }
    if (before !== after) {
      changes.push({
        type: 'write-file',
        path: targetPath,
        allowedRoot: projectDir,
        before,
        after,
        reason: `Install bundled Skill file ${file}`,
        preview: [before === undefined
          ? '+ install bundled Skill file'
          : '~ refresh bundled Skill file'],
      })
    }
  }
  return {
    id: `${client}-skill-install`,
    summary: `Install wot-ui-v2 Skill for ${client}`,
    changes,
    warnings,
    requiresConfirmation: changes.length > 0,
  }
}

async function planSkillRemove(projectDir: string, client: McpClientId): Promise<ChangePlan> {
  const source = resolveBundledWotSkill()
  const target = getSkillTarget(projectDir, client)
  const changes: PlannedFileChange[] = []
  const warnings: string[] = []
  for (const file of await listFiles(source)) {
    const path = join(target, file)
    const before = await readOptional(path)
    if (before === undefined)
      continue
    const expected = await readFile(join(source, file), 'utf8')
    if (before !== expected) {
      warnings.push(`Modified Skill file left unchanged: ${path}`)
      continue
    }
    changes.push({ type: 'delete-file', path, allowedRoot: projectDir, before, reason: `Remove installed Skill file ${file}`, preview: ['- remove bundled Skill file'] })
  }
  return {
    id: `${client}-skill-remove`,
    summary: `Remove wot-ui-v2 Skill for ${client}`,
    changes,
    warnings,
    requiresConfirmation: changes.length > 0,
  }
}

async function planInstructions(projectDir: string, client: McpClientId, remove: boolean): Promise<ChangePlan> {
  const path = getInstructionsTarget(projectDir, client)
  const before = await readOptional(path)
  const after = remove
    ? removeManagedInstructions(before ?? '')
    : updateManagedInstructions(before ?? '', createAgentInstructions(client))
  return {
    id: `${client}-instructions-${remove ? 'remove' : 'install'}`,
    summary: `${remove ? 'Remove' : 'Install'} managed Agent instructions for ${client}`,
    changes: (before ?? '') === after
      ? []
      : [{
          type: 'write-file',
          path,
          allowedRoot: projectDir,
          before,
          after,
          reason: `${remove ? 'Remove' : 'Update'} only the open-wot managed instructions block`,
          preview: [remove ? '- open-wot managed instructions block' : '+ open-wot managed instructions block'],
        }],
    warnings: [],
    requiresConfirmation: (before ?? '') !== after,
  }
}

export interface AgentPlanOptions extends McpOperationOptions {
  client: McpClientId
  capabilities: AgentCapability[]
  scope?: McpScope
}

export async function planAgentInit(options: AgentPlanOptions): Promise<ChangePlan> {
  const context = createDetectContext(options)
  const plans: ChangePlan[] = []
  if (options.capabilities.includes('mcp'))
    plans.push(...await planMcpInstall(options.client, options))
  if (options.capabilities.includes('skill'))
    plans.push(await planSkillInstall(context.cwd, options.client))
  if (options.capabilities.includes('instructions'))
    plans.push(await planInstructions(context.cwd, options.client, false))
  return mergeChangePlans(`Initialize wot-ui Agent integration for ${options.client}`, plans)
}

export async function planAgentRemove(options: AgentPlanOptions): Promise<ChangePlan> {
  const context = createDetectContext(options)
  const plans: ChangePlan[] = []
  if (options.capabilities.includes('mcp'))
    plans.push(...await planMcpRemove(options.client, options))
  if (options.capabilities.includes('skill'))
    plans.push(await planSkillRemove(context.cwd, options.client))
  if (options.capabilities.includes('instructions'))
    plans.push(await planInstructions(context.cwd, options.client, true))
  return mergeChangePlans(`Remove wot-ui Agent integration for ${options.client}`, plans)
}

export async function inspectAgentSkill(projectDir: string, client: McpClientId): Promise<{ installed: boolean, matches: boolean }> {
  const source = resolveBundledWotSkill()
  const target = getSkillTarget(projectDir, client)
  const skillInstalled = await exists(join(target, 'SKILL.md'))
  let skillMatches = skillInstalled
  for (const file of await listFiles(source)) {
    if (await readOptional(join(target, file)) !== await readFile(join(source, file), 'utf8')) {
      skillMatches = false
      break
    }
  }
  return { installed: skillInstalled, matches: skillMatches }
}

export async function inspectAgentInstructions(projectDir: string, client: McpClientId): Promise<{ installed: boolean }> {
  const instructions = await readOptional(getInstructionsTarget(projectDir, client))
  if (!instructions)
    return { installed: false }
  try {
    return { installed: Boolean(findManagedInstructionsRange(instructions)) }
  }
  catch {
    return { installed: false }
  }
}

export async function inspectAgentFiles(projectDir: string, client: McpClientId): Promise<{ skillInstalled: boolean, skillMatches: boolean, instructionsInstalled: boolean }> {
  const [skill, instructions] = await Promise.all([
    inspectAgentSkill(projectDir, client),
    inspectAgentInstructions(projectDir, client),
  ])
  return {
    skillInstalled: skill.installed,
    skillMatches: skill.matches,
    instructionsInstalled: instructions.installed,
  }
}

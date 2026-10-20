import type { ChangePlan, McpClientId, McpScope, PlannedFileChange } from '../mcp/clients'
import type { McpOperationOptions } from './mcp-onboarding'
import { existsSync } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { DeepseekProjectLocationError } from '../../runtime/deepseek-project-bridge.mjs'
import { MCP_CLIENT_IDS } from '../mcp/clients'
import { mergeChangePlans } from './change-plan'
import { createDetectContext, planMcpInstall, planMcpRemove } from './mcp-onboarding'

export type AgentCapability = 'mcp' | 'skill' | 'instructions'

export async function agentSkillLocationProblem(projectDir: string, client: McpClientId): Promise<string | undefined> {
  if (client !== 'deepseek')
    return undefined
  const cwd = resolve(projectDir)
  let current = cwd
  while (true) {
    if (await exists(join(current, '.git')))
      return current === cwd ? undefined : `DeepSeek discovers project Skills at the Git root. Retry with --cwd ${JSON.stringify(current)}.`
    const parent = dirname(current)
    if (parent === current)
      return undefined
    current = parent
  }
}

async function assertSkillLocation(options: AgentPlanOptions, cwd: string): Promise<void> {
  if (!options.capabilities.includes('skill'))
    return
  const problem = await agentSkillLocationProblem(cwd, options.client)
  if (problem)
    throw new DeepseekProjectLocationError(problem)
}

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

function skillDirectory(client: McpClientId): string {
  if (client === 'claude')
    return '.claude'
  if (client === 'qoder' || client === 'qoder-cli')
    return '.qoder'
  if (client === 'codebuddy' || client === 'codebuddy-cli')
    return '.codebuddy'
  return '.agents'
}

function skillReference(client: McpClientId): string {
  return `${skillDirectory(client)}/skills/wot-ui-v2/SKILL.md`
}

export function getSkillTarget(projectDir: string, client: McpClientId): string {
  return resolve(projectDir, skillDirectory(client), 'skills', 'wot-ui-v2')
}

export function getInstructionsTarget(projectDir: string, client: McpClientId): string {
  return resolve(projectDir, client === 'claude' ? 'CLAUDE.md' : client === 'codebuddy' || client === 'codebuddy-cli' ? 'CODEBUDDY.md' : 'AGENTS.md')
}

export function createAgentInstructions(client: McpClientId, references = [skillReference(client)]): string {
  const skills = [...new Set(references)].sort()
  const instruction = skills.length === 1
    ? `read the project Skill at \`${skills[0]}\``
    : `read the project Skill for your client at ${skills.map(skill => `\`${skill}\``).join(' or ')}`
  return [
    INSTRUCTIONS_START,
    '## Wot UI Agent Instructions',
    '',
    `Before generating or modifying wot-ui component code, ${instruction} and query the configured \`wot-ui\` MCP server for version-accurate APIs and examples.`,
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

async function planInstructions(projectDir: string, client: McpClientId, remove: boolean, clients: McpClientId[] = [client]): Promise<ChangePlan> {
  const path = getInstructionsTarget(projectDir, client)
  const before = await readOptional(path)
  const range = findManagedInstructionsRange(before ?? '')
  const block = range ? before!.slice(range.start, range.end) : ''
  const candidates = MCP_CLIENT_IDS
    .filter(candidate => getInstructionsTarget(projectDir, candidate) === path)
  const existing = candidates
    .filter(candidate => block.includes(`\`${skillReference(candidate)}\``))
    .map(skillReference)
  const selected = candidates.filter(candidate => clients.includes(candidate)).map(skillReference)
  const references = remove ? existing.filter(reference => !selected.includes(reference)) : [...existing, ...selected]
  let after = before ?? ''
  if (!remove || (references.length > 0 && existing.some(reference => selected.includes(reference))))
    after = updateManagedInstructions(after, createAgentInstructions(client, references))
  else if (references.length === 0)
    after = removeManagedInstructions(after)
  const removeBlock = remove && references.length === 0
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
          reason: `${removeBlock ? 'Remove' : 'Update'} only the open-wot managed instructions block`,
          preview: [removeBlock ? '- open-wot managed instructions block' : remove ? '~ remove selected Skill references; keep other clients' : '+ open-wot managed instructions block'],
        }],
    warnings: [],
    requiresConfirmation: (before ?? '') !== after,
  }
}

export interface AgentPlanOptions extends McpOperationOptions {
  client: McpClientId
  capabilities: AgentCapability[]
  scope?: McpScope
  /** Clients sharing the current transaction's Instructions files. */
  instructionClients?: McpClientId[]
}

export async function planAgentInit(options: AgentPlanOptions): Promise<ChangePlan> {
  const context = createDetectContext(options)
  await assertSkillLocation(options, context.cwd)
  const plans: ChangePlan[] = []
  if (options.capabilities.includes('mcp'))
    plans.push(...await planMcpInstall(options.client, options))
  if (options.capabilities.includes('skill'))
    plans.push(await planSkillInstall(context.cwd, options.client))
  if (options.capabilities.includes('instructions'))
    plans.push(await planInstructions(context.cwd, options.client, false, options.instructionClients))
  return mergeChangePlans(`Initialize wot-ui Agent integration for ${options.client}`, plans)
}

export async function planAgentRemove(options: AgentPlanOptions): Promise<ChangePlan> {
  const context = createDetectContext(options)
  await assertSkillLocation(options, context.cwd)
  const plans: ChangePlan[] = []
  if (options.capabilities.includes('mcp'))
    plans.push(...await planMcpRemove(options.client, options))
  if (options.capabilities.includes('skill'))
    plans.push(await planSkillRemove(context.cwd, options.client))
  if (options.capabilities.includes('instructions'))
    plans.push(await planInstructions(context.cwd, options.client, true, options.instructionClients))
  const plan = mergeChangePlans(`Remove wot-ui Agent integration for ${options.client}`, plans)
  if (options.client === 'deepseek' && options.capabilities.some(capability => capability !== 'mcp'))
    plan.warnings.push('Project Skills and AGENTS.md instructions are shared with other agents; removing them affects those agents too.')
  if (['qoder', 'qoder-cli', 'codebuddy', 'codebuddy-cli'].includes(options.client) && options.capabilities.some(capability => capability !== 'mcp'))
    plan.warnings.push('Project Skills and instructions may be shared by IDE, CLI, or other agents; removing them affects those clients too.')
  return plan
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
    const range = findManagedInstructionsRange(instructions)
    return { installed: Boolean(range && instructions.slice(range.start, range.end).includes(`\`${skillReference(client)}\``)) }
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

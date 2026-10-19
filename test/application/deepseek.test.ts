import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentSkillLocationProblem, inspectAgentFiles, planAgentInit, planAgentRemove } from '../../src/application/agent-onboarding'
import { applyChangePlan } from '../../src/application/change-plan'
import { doctorMcpClients } from '../../src/application/mcp-doctor'
import { verifyMcpHandshake } from '../../src/application/mcp-handshake'
import { createPlanContext } from '../../src/application/mcp-onboarding'
import { deepseekAdapter } from '../../src/mcp/clients/deepseek'

vi.mock('../../src/application/mcp-handshake', () => ({ verifyMcpHandshake: vi.fn() }))
const directories: string[] = []
async function setup() {
  const cwd = await mkdtemp(join(tmpdir(), 'open-wot-dsh-agent-'))
  directories.push(cwd)
  return { client: 'deepseek' as const, cwd, homeDir: join(cwd, 'home'), scope: 'user' as const, env: { PATH: '' }, capabilities: ['mcp', 'skill', 'instructions'] as const }
}
afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('deepSeek Agent integration', () => {
  it('keeps project assets local, deduplicates, and preserves modified files on remove', async () => {
    const options = await setup()
    const plan = await planAgentInit({ ...options, capabilities: [...options.capabilities] })
    const instructions = join(options.cwd, 'AGENTS.md')
    await expect(readFile(instructions)).rejects.toThrow()
    await applyChangePlan(plan)
    expect(await inspectAgentFiles(options.cwd, 'deepseek')).toEqual({ skillInstalled: true, skillMatches: true, instructionsInstalled: true })
    expect((await planAgentInit({ ...options, capabilities: [...options.capabilities] })).changes).toEqual([])
    const skill = join(options.cwd, '.agents/skills/wot-ui-v2/SKILL.md')
    await writeFile(skill, 'user content')
    await writeFile(instructions, `# User rules\n${await readFile(instructions, 'utf8')}`)
    const removal = await planAgentRemove({ ...options, capabilities: [...options.capabilities] })
    expect(removal.warnings.join(' ')).toContain('shared')
    await applyChangePlan(removal)
    expect(await readFile(skill, 'utf8')).toBe('user content')
    expect(await readFile(instructions, 'utf8')).toContain('# User rules')
    expect(await readFile(instructions, 'utf8')).not.toContain('open-wot agent instructions start')
  })

  it.each(['directory', 'file'])('guards subdirectory skills with a .git %s', async (kind) => {
    const options = await setup()
    if (kind === 'directory')
      await mkdir(join(options.cwd, '.git'))
    else
      await writeFile(join(options.cwd, '.git'), 'gitdir: /unused')
    const child = join(options.cwd, 'child')
    await mkdir(child)
    expect(await agentSkillLocationProblem(options.cwd, 'deepseek')).toBeUndefined()
    expect(await agentSkillLocationProblem(child, 'cursor')).toBeUndefined()
    expect(await agentSkillLocationProblem(child, 'deepseek')).toContain('--cwd')
    for (const makePlan of [planAgentInit, planAgentRemove])
      await expect(makePlan({ ...options, cwd: child, capabilities: ['skill', 'mcp'] })).rejects.toThrow('--cwd')
    const mcpOnly = await planAgentInit({ ...options, cwd: child, capabilities: ['mcp'] })
    expect(mcpOnly.changes).toHaveLength(1)
  })

  it('rolls back both existing MCP and newly created assets after a later commit fails', async () => {
    const options = await setup()
    const context = createPlanContext(options)
    await applyChangePlan(await deepseekAdapter.planInstall(context))
    const path = join(options.homeDir, '.dsh/cordis.patch.yml')
    const before = await readFile(path, 'utf8')
    const plan = await planAgentInit({ ...options, pin: '1.1.0', capabilities: [...options.capabilities] })
    await expect(applyChangePlan(plan, { beforeCommit(_change, index) {
      if (index === 2)
        throw new Error('injected commit failure')
    } })).rejects.toThrow('rolled back 2')
    expect(await readFile(path, 'utf8')).toBe(before)
    for (const change of plan.changes.slice(1))
      await expect(readFile(change.path)).rejects.toThrow()
  })

  it('reports incomplete rollback and retains the backup', async () => {
    const options = await setup()
    const context = createPlanContext(options)
    await applyChangePlan(await deepseekAdapter.planInstall(context))
    const plan = await planAgentInit({ ...options, pin: '1.1.0', capabilities: [...options.capabilities] })
    await expect(applyChangePlan(plan, {
      beforeCommit(_change, index) {
        if (index === 1)
          throw new Error('commit failure')
      },
      beforeRollback() { throw new Error('rollback failure') },
    })).rejects.toThrow(/rollback incomplete.*backup:/)
  })

  it('rejects a parent symlink escaping an existing allowed root', async () => {
    const options = await setup()
    const root = join(options.cwd, 'allowed')
    const outside = join(options.cwd, 'outside')
    await mkdir(root)
    await mkdir(outside)
    await symlink(outside, join(root, 'escape'))
    await expect(applyChangePlan({ id: 'escape', summary: '', requiresConfirmation: true, warnings: [], changes: [{ type: 'write-file', path: join(root, 'escape/config.yml'), allowedRoot: root, after: 'no', reason: 'test path boundary' }] })).rejects.toThrow('outside allowed root')
  })

  it.each([
    { ok: true, tools: ['wot_status', 'wot_list'], overall: 'server-ready' },
    { ok: true, tools: ['wot_status'], overall: 'failed' },
    { ok: false, tools: [], overall: 'failed' },
  ].flatMap(result => ['user', 'project'].map(scope => ({ ...result, scope: scope as 'user' | 'project' }))))('does not claim runtime registration for $scope $overall', async ({ ok, tools, overall, scope }) => {
    const options = { ...await setup(), scope }
    await applyChangePlan(await deepseekAdapter.planInstall(createPlanContext(options)))
    vi.mocked(verifyMcpHandshake).mockResolvedValue({ ok, tools, serverName: 'wot-ui', durationMs: 1, ...ok ? {} : { error: 'timeout' } })
    const [report] = await doctorMcpClients('deepseek', options)
    expect(report!.overall).toBe(overall)
    expect(report!.clientRegistration.status).toBe('unsupported')
    expect(report!.clientRegistration.action).toContain('standard-mode')
  })
})

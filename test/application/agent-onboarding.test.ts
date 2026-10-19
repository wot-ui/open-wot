import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentInstructions, getInstructionsTarget, getSkillTarget, inspectAgentFiles, planAgentInit, planAgentRemove, removeManagedInstructions } from '../../src/application/agent-onboarding'
import { applyChangePlan, mergeChangePlans } from '../../src/application/change-plan'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('agent onboarding', () => {
  it.each(['qoder', 'qoder-cli', 'codebuddy', 'codebuddy-cli'] as const)('%s installs native project assets even with user scope and preserves user edits on removal', async (client) => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-native-agent-'))
    directories.push(cwd)
    const options = { client, capabilities: ['skill', 'instructions'] as ('skill' | 'instructions')[], cwd, homeDir: join(cwd, 'unused-home'), scope: 'user' as const }
    const path = getInstructionsTarget(cwd, client)
    await writeFile(path, '# User rules\n\nKeep this exact text.\n')
    await applyChangePlan(await planAgentInit(options))
    expect(await inspectAgentFiles(cwd, client)).toEqual({ skillInstalled: true, skillMatches: true, instructionsInstalled: true })
    const skill = join(getSkillTarget(cwd, client), 'SKILL.md')
    const installed = await readFile(path, 'utf8')
    expect(installed).toContain(client.startsWith('qoder') ? '.qoder/skills/wot-ui-v2/SKILL.md' : '.codebuddy/skills/wot-ui-v2/SKILL.md')
    expect((await planAgentInit(options)).changes).toHaveLength(0)
    await writeFile(skill, 'User customized Skill')
    const removal = await planAgentRemove(options)
    expect(removal.warnings.join(' ')).toContain('Modified Skill file left unchanged')
    expect(removal.warnings.join(' ')).toContain('shared')
    await applyChangePlan(removal)
    expect(await readFile(skill, 'utf8')).toBe('User customized Skill')
    expect(await readFile(path, 'utf8')).toContain('# User rules\n\nKeep this exact text.\n')
    expect(await readFile(path, 'utf8')).not.toContain('open-wot agent instructions start')
    await expect(readFile(join(cwd, '.mcp.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('merges shared Instructions for all clients and preserves references on sequential init', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-shared-agent-'))
    directories.push(cwd)
    const clients = ['cursor', 'qoder', 'qoder-cli', 'codebuddy', 'codebuddy-cli'] as const
    const options = { cwd, homeDir: cwd, capabilities: ['skill', 'instructions'] as ('skill' | 'instructions')[] }
    const plans = await Promise.all(clients.map(client => planAgentInit({ ...options, client, instructionClients: [...clients] })))
    await applyChangePlan(mergeChangePlans('All', plans))
    const content = await readFile(join(cwd, 'AGENTS.md'), 'utf8')
    expect(content.match(/open-wot agent instructions start/g)).toHaveLength(1)
    expect(content).toContain('.agents/skills/wot-ui-v2/SKILL.md')
    expect(content).toContain('.qoder/skills/wot-ui-v2/SKILL.md')
    for (const client of clients)
      expect((await planAgentInit({ ...options, client })).changes).toEqual([])
    const again = await Promise.all(clients.map(client => planAgentInit({ ...options, client, instructionClients: [...clients] })))
    expect(mergeChangePlans('All', again).changes).toEqual([])
  })

  it('rolls back a new client MCP and assets if a later write fails', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-native-rollback-'))
    directories.push(cwd)
    const path = join(cwd, '.mcp.json')
    const original = '{"mcpServers":{"other":{"command":"other","args":[]}}}'
    await writeFile(path, original)
    const plan = await planAgentInit({ client: 'qoder-cli', capabilities: ['mcp', 'skill', 'instructions'], cwd, homeDir: cwd })
    await expect(applyChangePlan(plan, { beforeCommit: (_change, index) => {
      if (index === 2)
        throw new Error('injected failure')
    } })).rejects.toThrow('injected failure')
    expect(await readFile(path, 'utf8')).toBe(original)
    await expect(readFile(join(cwd, 'AGENTS.md'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await inspectAgentFiles(cwd, 'qoder-cli')).skillInstalled).toBe(false)
  })

  it('installs and removes Skill and managed instructions idempotently', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-agent-'))
    directories.push(cwd)
    const options = {
      client: 'cursor' as const,
      capabilities: ['skill', 'instructions'] as const,
      cwd,
      homeDir: cwd,
      scope: 'project' as const,
    }

    const install = await planAgentInit({ ...options, capabilities: [...options.capabilities] })
    await applyChangePlan(install)
    expect(await inspectAgentFiles(cwd, 'cursor')).toEqual({ skillInstalled: true, skillMatches: true, instructionsInstalled: true })
    expect((await planAgentInit({ ...options, capabilities: [...options.capabilities] })).changes).toHaveLength(0)
    expect(await readFile(join(cwd, 'AGENTS.md'), 'utf8')).toContain('open-wot agent instructions start')

    await applyChangePlan(await planAgentRemove({ ...options, capabilities: [...options.capabilities] }))
    expect(await inspectAgentFiles(cwd, 'cursor')).toEqual({ skillInstalled: false, skillMatches: false, instructionsInstalled: false })
  })

  it('leaves user instructions byte-for-byte unchanged when no managed block exists', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-agent-user-instructions-'))
    directories.push(cwd)
    const path = join(cwd, 'AGENTS.md')
    const content = '# User instructions\n\n'
    await writeFile(path, content)

    const plan = await planAgentRemove({
      client: 'cursor',
      capabilities: ['instructions'],
      cwd,
      homeDir: cwd,
      scope: 'project',
    })

    expect(plan.changes).toHaveLength(0)
    expect(await readFile(path, 'utf8')).toBe(content)
  })

  it('uses and removes Antigravity project Skill and shared AGENTS.md instructions', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-agent-antigravity-'))
    directories.push(cwd)
    const options = {
      client: 'antigravity' as const,
      capabilities: ['skill', 'instructions'] as const,
      cwd,
      homeDir: cwd,
      scope: 'project' as const,
    }

    await applyChangePlan(await planAgentInit({ ...options, capabilities: [...options.capabilities] }))
    expect(await readFile(join(cwd, '.agents', 'skills', 'wot-ui-v2', 'SKILL.md'), 'utf8')).toContain('wot-ui-v2')
    expect(await readFile(join(cwd, 'AGENTS.md'), 'utf8')).toContain('open-wot agent instructions start')
    expect(await inspectAgentFiles(cwd, 'antigravity')).toEqual({ skillInstalled: true, skillMatches: true, instructionsInstalled: true })

    await applyChangePlan(await planAgentRemove({ ...options, capabilities: [...options.capabilities] }))
    expect(await readFile(join(cwd, 'AGENTS.md'), 'utf8')).not.toContain('open-wot agent instructions start')
    expect(await inspectAgentFiles(cwd, 'antigravity')).toEqual({ skillInstalled: false, skillMatches: false, instructionsInstalled: false })
  })

  it('removes only the exact managed range without normalizing user whitespace', () => {
    const block = createAgentInstructions('cursor')
    const content = `first\n\n\nsecond\n\n${block}\n\n\ntail\n`

    expect(removeManagedInstructions(content)).toBe('first\n\n\nsecond\n\n\n\n\ntail\n')
  })

  it('refuses malformed or duplicate managed instruction markers', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-agent-malformed-instructions-'))
    directories.push(cwd)
    const path = join(cwd, 'AGENTS.md')
    const content = '<!-- open-wot agent instructions start -->\nKEEP THIS USER CONTENT\n'
    await writeFile(path, content)
    const options = {
      client: 'cursor' as const,
      capabilities: ['instructions'] as const,
      cwd,
      homeDir: cwd,
      scope: 'project' as const,
    }

    await expect(planAgentInit({ ...options, capabilities: [...options.capabilities] })).rejects.toThrow('Malformed open-wot Agent instructions markers')
    await expect(planAgentRemove({ ...options, capabilities: [...options.capabilities] })).rejects.toThrow('Malformed open-wot Agent instructions markers')
    expect(await readFile(path, 'utf8')).toBe(content)
  })
})

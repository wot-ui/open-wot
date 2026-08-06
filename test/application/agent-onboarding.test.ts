import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createAgentInstructions, inspectAgentFiles, planAgentInit, planAgentRemove, removeManagedInstructions } from '../../src/application/agent-onboarding'
import { applyChangePlan } from '../../src/application/change-plan'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('agent onboarding', () => {
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

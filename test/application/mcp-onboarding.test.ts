import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { planAgentInit, planAgentRemove } from '../../src/application/agent-onboarding'
import { applyChangePlan, mergeChangePlans } from '../../src/application/change-plan'
import { planMcpInstall, planMcpRemove, planSelectedClient } from '../../src/application/mcp-onboarding'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'open-wot-all-'))
  directories.push(root)
  const cwd = join(root, 'sub')
  const homeDir = join(root, 'home')
  await mkdir(join(root, '.git'))
  await mkdir(cwd)
  await mkdir(homeDir)
  return { root, cwd, homeDir, env: { PATH: '', DSH_HOME: join(homeDir, '.dsh') } }
}

describe('multi-client location handling', () => {
  it('installs and removes the other six project clients from a Git subdirectory', async () => {
    const options = await fixture()
    const plans = await planMcpInstall('all', options)
    expect(plans).toHaveLength(7)
    const skipped = plans.find(plan => plan.id === 'deepseek-skipped-location')!
    expect(skipped.changes).toEqual([])
    expect(skipped.warnings[0]).toContain('Skipped DeepSeek: Run from the Git root')
    expect(plans.filter(plan => plan.changes.length)).toHaveLength(6)
    await applyChangePlan(mergeChangePlans('Install all', plans))
    const remove = await planMcpRemove('all', options)
    expect(remove.filter(plan => plan.changes.length)).toHaveLength(6)
    expect(remove.find(plan => plan.id === skipped.id)).toEqual(skipped)
    await applyChangePlan(mergeChangePlans('Remove all', remove))
  })

  it.each([planAgentInit, planAgentRemove])('skips DeepSeek user onboarding with Skills in all selection', async (plan) => {
    const options = await fixture()
    const operation = () => plan({ ...options, client: 'deepseek', scope: 'user', capabilities: ['mcp', 'skill', 'instructions'] })
    const skipped = await planSelectedClient('all', 'deepseek', operation)
    expect(skipped.changes).toEqual([])
    expect(skipped.warnings[0]).toContain('Skipped DeepSeek: DeepSeek discovers project Skills at the Git root')
    await expect(planSelectedClient('deepseek', 'deepseek', operation)).rejects.toThrow('Git root')
    await expect(planSelectedClient('auto', 'deepseek', operation)).rejects.toThrow('Git root')
  })

  it('keeps root requirements for explicit and automatically detected MCP clients', async () => {
    const options = await fixture()
    await mkdir(join(options.cwd, '.dsh'))
    await writeFile(join(options.cwd, '.dsh', 'wot-ui.json'), '{}')
    for (const selection of ['deepseek', 'auto'] as const) {
      await expect(planMcpInstall(selection, options)).rejects.toThrow('Git root')
      await expect(planMcpRemove(selection, options)).rejects.toThrow('Git root')
    }
  })

  it.each([planMcpInstall, planMcpRemove])('reports auto ambiguity before checking the DeepSeek project location', async (plan) => {
    const options = await fixture()
    await mkdir(join(options.cwd, '.dsh'))
    await writeFile(join(options.cwd, '.dsh', 'wot-ui.json'), '{}')
    await mkdir(join(options.cwd, '.cursor'))
    await writeFile(join(options.cwd, '.cursor', 'mcp.json'), '{}')
    await expect(plan('auto', options)).rejects.toThrow('Multiple MCP clients detected (cursor, deepseek)')
  })

  it('includes DeepSeek at the Git root and still rejects invalid configuration in all selection', async () => {
    const options = await fixture()
    const rootOptions = { ...options, cwd: options.root }
    const plans = await planMcpInstall('all', rootOptions)
    expect(plans.find(plan => plan.id === 'deepseek-project-install')?.changes).toHaveLength(3)
    await mkdir(join(options.root, '.dsh'))
    await writeFile(join(options.root, '.dsh', 'wot-ui.json'), 'invalid JSON')
    await expect(planMcpInstall('all', rootOptions)).rejects.toThrow('Invalid DeepSeek project JSON')
  })

  it('does not skip user MCP alone in a subdirectory', async () => {
    const options = await fixture()
    const plans = await planMcpInstall('all', { ...options, scope: 'user' })
    expect(plans.some(plan => plan.id === 'deepseek-skipped-location')).toBe(false)
    expect(plans.some(plan => plan.changes.some(change => change.path.endsWith('cordis.patch.yml')))).toBe(true)
  })
})

import type { PlanContext } from '../../src/mcp/clients/types'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { applyChangePlan, toPublicChangePlan } from '../../src/application/change-plan'
import { createMcpServerDefinition, resolveMcpAdapters } from '../../src/application/mcp-onboarding'
import { deepseekAdapter } from '../../src/mcp/clients/deepseek'
import { editDeepseekConfig, inspectDeepseekConfig, printDeepseekConfig } from '../../src/mcp/clients/deepseek-config'

const directories: string[] = []
async function setup(): Promise<PlanContext> {
  const cwd = await mkdtemp(join(tmpdir(), 'open-wot-deepseek-'))
  directories.push(cwd)
  return { cwd, homeDir: join(cwd, 'home'), scope: 'user', env: { PATH: '' }, server: createMcpServerDefinition() }
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
const server = createMcpServerDefinition()

describe('deepSeek YAML patches', () => {
  it.each(['', '# keep\n', '---\n...\n', '# keep\n[]\n', '[{id: other, config: {secret: token}}]\n', '[{id: other}, ]\n', '# keep\n- id: other\n  config: !!js process.env.SECRET\n# end\n...\n', '# keep\r\n- id: other\r\n  config: !custom value\r\n...\r\n'])('round trips unrelated source and updates only the version: %j', (source) => {
    const installed = editDeepseekConfig(source, server)
    expect(inspectDeepseekConfig(installed)).toEqual(server)
    expect(editDeepseekConfig(installed, server)).toBe(installed)
    const pinned = createMcpServerDefinition('1.1.0')
    const updated = editDeepseekConfig(installed, pinned)
    expect(inspectDeepseekConfig(updated)).toEqual(pinned)
    const removed = editDeepseekConfig(updated, undefined)
    expect(inspectDeepseekConfig(removed)).toBeUndefined()
    expect(editDeepseekConfig(removed, undefined)).toBe(removed)
    for (const fragment of ['# keep', '# end', '!!js process.env.SECRET', '!custom value', 'secret: token']) {
      if (source.includes(fragment))
        expect(removed).toContain(fragment)
    }
    // Complete unrelated block entries survive byte-for-byte.
    if (source.includes('- id: other'))
      expect(removed).toContain(source.slice(source.indexOf('- id: other')))
    if (source.includes('\r\n'))
      expect(installed.replaceAll('\r\n', '')).not.toContain('\n')
  })

  it('preserves comments inside a managed entry when pinning and removing', () => {
    const original = printDeepseekConfig(server).replace('command: npx', 'command: npx # keep command note')
    const updated = editDeepseekConfig(original, createMcpServerDefinition('2.0.0'))
    expect(updated).toContain('# keep command note')
    expect(editDeepseekConfig(updated, undefined)).toContain('# keep command note')
  })

  it('handles managed flow entries in every position and trailing commas', () => {
    const row = parse(printDeepseekConfig(server))[0]
    for (const rows of [[row], [row, { id: 'other' }], [{ id: 'other' }, row], [{ id: 'first' }, row, { id: 'last' }]]) {
      for (const trailing of ['', ',']) {
        const source = `${JSON.stringify(rows).slice(0, -1)}${trailing}]\n`
        const removed = editDeepseekConfig(source, undefined)
        expect(parse(removed)).toEqual(rows.filter(item => item !== row))
      }
    }
  })

  it.each([
    'not-a-list',
    '- id: [SECRET',
    '- id: one\n  id: SECRET',
    '- insert:\n    - config: { serverName: wot-ui }',
    '- id: open-wot-mcp\n  config: {}',
    '- id: other\n  config: &shared {}\n- id: another\n  config: *shared',
    printDeepseekConfig(server) + printDeepseekConfig(server),
    `${printDeepseekConfig(server)}- id: open-wot-mcp\n  disabled: true\n`,
    printDeepseekConfig(server).replace('command: npx', 'command: evil'),
    printDeepseekConfig(server).replace('command: npx', 'command: npx\n      env: {TOKEN: SECRET}'),
    printDeepseekConfig(server).replace('command: npx', 'command: !!js SECRET'),
    printDeepseekConfig(server).replace('transport: stdio', 'transport: stdio\n      disabled: true'),
  ])('rejects conflicts without echoing sensitive input: %j', (source) => {
    for (const action of [() => editDeepseekConfig(source, server), () => editDeepseekConfig(source, undefined), () => inspectDeepseekConfig(source)]) {
      expect(action).toThrow()
      try {
        action()
      }
      catch (error) {
        expect(String(error)).not.toContain('SECRET')
      }
    }
  })
})

describe('deepSeek adapter', () => {
  it.each([undefined, '', '  ', '~/custom', '~', 'relative', '/tmp/open-wot-dsh-home'])('resolves DSH_HOME %j without writing', async (home) => {
    const context = await setup()
    context.env = { PATH: '', ...(home === undefined ? {} : { DSH_HOME: home }) }
    const detected = await deepseekAdapter.detect(context)
    const base = !home?.trim() ? join(context.homeDir, '.dsh') : home === '~' ? context.homeDir : home.startsWith('~/') ? join(context.homeDir, home.slice(2)) : home.startsWith('/') ? home : join(context.cwd, home)
    expect(detected.configLocations).toContain(join(base, 'cordis.patch.yml'))
    expect(detected.supportedScopes).toEqual(['project', 'user'])
  })

  it('detects dsh or an existing patch file, and respects scopes', async () => {
    const context = await setup()
    expect((await deepseekAdapter.detect(context)).installed).toBe(false)
    const binary = join(context.cwd, process.platform === 'win32' ? 'dsh.CMD' : 'dsh')
    await writeFile(binary, '')
    await chmod(binary, 0o755)
    expect((await deepseekAdapter.detect({ ...context, env: { PATH: context.cwd } })).installed).toBe(true)
    await applyChangePlan(await deepseekAdapter.planInstall(context))
    expect((await deepseekAdapter.detect(context)).installed).toBe(true)
    expect((await resolveMcpAdapters('all', context)).map(item => item.id)).toContain('deepseek')
    expect((await resolveMcpAdapters('all', { ...context, scope: 'project' })).map(item => item.id)).toContain('deepseek')
    expect((await resolveMcpAdapters('auto', context)).map(item => item.id)).toEqual(['deepseek'])
    expect(await resolveMcpAdapters('deepseek', { ...context, scope: 'project' })).toEqual([deepseekAdapter])
  })

  it('installs in a missing root outside home and removes only its entry', async () => {
    const context = await setup()
    context.env!.DSH_HOME = join(context.cwd, 'custom', 'new')
    const first = await deepseekAdapter.planInstall(context)
    await applyChangePlan(first)
    expect((await deepseekAdapter.inspect(context)).matches).toBe(true)
    expect((await deepseekAdapter.planInstall(context)).changes).toEqual([])
    expect(toPublicChangePlan(first).changes[0]!.preview).toContain('+ open-wot-mcp (wot-ui, stdio)')
    await applyChangePlan(await deepseekAdapter.planRemove(context))
    expect((await deepseekAdapter.planRemove(context)).changes).toEqual([])
  })

  it('preserves concurrent edits and rejects symbolic-link targets', async () => {
    const context = await setup()
    const initial = await deepseekAdapter.planInstall(context)
    const path = initial.changes[0]!.path
    await applyChangePlan(initial)
    const removal = await deepseekAdapter.planRemove(context)
    await writeFile(path, '# concurrent\n[]\n')
    await expect(applyChangePlan(removal)).rejects.toThrow('Target changed')
    expect(await readFile(path, 'utf8')).toContain('# concurrent')
    await rm(path)
    const other = join(context.cwd, 'outside.yml')
    await writeFile(other, '[]\n')
    await symlink(other, path)
    await expect(applyChangePlan(await deepseekAdapter.planInstall(context))).rejects.toThrow(/outside allowed root|symbolic link/)
    expect(await readFile(other, 'utf8')).toBe('[]\n')
  })

  it('reports malformed configuration without leaking its source', async () => {
    const context = await setup()
    await mkdir(join(context.homeDir, '.dsh'), { recursive: true })
    await writeFile(join(context.homeDir, '.dsh', 'cordis.patch.yml'), '- secret: [SECRET')
    const state = await deepseekAdapter.inspect(context)
    expect(state.matches).toBe(false)
    expect(state.problem).toContain('Invalid DeepSeek YAML')
    expect(JSON.stringify(state)).not.toContain('SECRET')
  })
})

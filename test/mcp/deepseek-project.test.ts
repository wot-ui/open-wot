import type { PlanContext } from '../../src/mcp/clients/types'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { digest, installRoot, parseDeclaration, selectProject } from '../../runtime/deepseek-project-bridge.mjs'
import { applyChangePlan } from '../../src/application/change-plan'
import { createMcpServerDefinition } from '../../src/application/mcp-onboarding'
import { deepseekAdapter } from '../../src/mcp/clients/deepseek'
import { editDeepseekConfig } from '../../src/mcp/clients/deepseek-config'
import { bridgePath, printProject } from '../../src/mcp/clients/deepseek-project'
import { editProjectBridge, inspectProjectBridge } from '../../src/mcp/clients/deepseek-project-config'

const dirs: string[] = []
async function setup(): Promise<PlanContext> {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'open-wot-project-')))
  dirs.push(cwd)
  return { cwd, homeDir: join(cwd, 'home'), env: { PATH: '' }, scope: 'project', server: createMcpServerDefinition() }
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
const server = createMcpServerDefinition()
const config = { schemaVersion: 1 as const, bridgeHash: 'a'.repeat(64), projects: [{ root: '/project', digest: 'b'.repeat(64) }] }
const bridge = '/home/open-wot/project-bridge.mjs'

describe('project declarations and registry', () => {
  it.each([undefined, '1.1.0', 'next', '2.0.0-rc.1'])('accepts fixed package versions %j', (pin) => {
    expect(parseDeclaration(printProject(createMcpServerDefinition(pin))).server).toEqual(createMcpServerDefinition(pin))
  })
  it.each([
    'SECRET',
    '{}',
    '{"schemaVersion":2}',
    JSON.stringify({ schemaVersion: 1, server, extra: 'SECRET' }),
    JSON.stringify({ schemaVersion: 1, server: { ...server, env: { TOKEN: 'SECRET' } } }),
    JSON.stringify({ schemaVersion: 1, server: { command: 'sh', args: ['SECRET'] } }),
    JSON.stringify({ schemaVersion: 1, server: { command: 'npx', args: ['-y', '@wot-ui/cli@https://SECRET', 'mcp'] } }),
  ])('rejects unsafe declarations without quoting source', (source) => {
    expect(() => parseDeclaration(source)).toThrow()
    try {
      parseDeclaration(source)
    }
    catch (error) { expect(String(error)).not.toContain('SECRET') }
  })
  it.each(['', '# keep\n[]\n', '---\n...\n', '[{id: other}, ]\n', '- id: other\n  config: !!js process.env.SECRET\n# end\n...\n'])('preserves unrelated YAML and updates one registry %j', (source) => {
    const installed = editProjectBridge(source, bridge, config)
    expect(inspectProjectBridge(installed, bridge)).toEqual(config)
    expect(editProjectBridge(installed, bridge, config)).toBe(installed)
    const updated = editProjectBridge(installed, bridge, { ...config, projects: [...config.projects, { root: '/other', digest: 'c'.repeat(64) }] })
    expect(inspectProjectBridge(updated, bridge)?.projects).toHaveLength(2)
    const removed = editProjectBridge(updated, bridge)
    expect(inspectProjectBridge(removed, bridge)).toBeUndefined()
    if (source.includes('!!js'))
      expect(removed).toContain('!!js process.env.SECRET')
    if (source.includes('# keep'))
      expect(removed).toContain('# keep')
  })
  it('handles flow rows, comments, global compatibility and edited bridge conflicts', () => {
    const installed = editProjectBridge('', bridge, config)
    const row = parse(installed)[0]
    for (const rows of [[row], [row, { id: 'other' }], [{ id: 'other' }, row]]) {
      expect(parse(editProjectBridge(JSON.stringify(rows), bridge))).toEqual(rows.filter(item => item !== row))
    }
    const commented = installed.replace('schemaVersion: 1', 'schemaVersion: 1 # keep')
    expect(editProjectBridge(commented, bridge)).toContain('# keep')
    expect(() => inspectProjectBridge(installed + installed, bridge)).toThrow()
    expect(() => inspectProjectBridge(installed.replace('schemaVersion: 1', 'schemaVersion: 2'), bridge)).toThrow()
    expect(() => inspectProjectBridge(installed.replace('bridgeHash:', 'env: SECRET\n      bridgeHash:'), bridge)).toThrow()
    const global = editDeepseekConfig(installed, server)
    expect(inspectProjectBridge(global, bridge)).toEqual(config)
  })
})

describe('project installation transactions', () => {
  it('installs A/B independently, refuses global conflict, and removes last shared bridge', async () => {
    const a = await setup()
    const b = { ...a, cwd: join(a.cwd, 'B'), server: createMcpServerDefinition('1.1.0') }
    await mkdir(b.cwd)
    const first = await deepseekAdapter.planInstall(a)
    expect(first.changes).toHaveLength(3)
    await expect(readFile(join(a.cwd, '.dsh/wot-ui.json'))).rejects.toThrow()
    await applyChangePlan(first)
    expect((await deepseekAdapter.inspect(a)).matches).toBe(true)
    expect((await deepseekAdapter.detect({ ...a, homeDir: join(a.cwd, 'other-home') })).installed).toBe(true)
    expect((await deepseekAdapter.planInstall(a)).changes).toEqual([])
    await applyChangePlan(await deepseekAdapter.planInstall(b))
    expect((await deepseekAdapter.inspect(b)).matches).toBe(true)
    await expect(deepseekAdapter.planInstall({ ...a, scope: 'user' })).rejects.toThrow('Project registrations')
    await applyChangePlan(await deepseekAdapter.planRemove(a))
    expect((await deepseekAdapter.inspect(b)).matches).toBe(true)
    expect((await deepseekAdapter.planRemove(a)).changes).toEqual([])
    await applyChangePlan(await deepseekAdapter.planRemove(b))
    await expect(readFile(bridgePath(join(a.homeDir, '.dsh')))).rejects.toThrow()
    await applyChangePlan(await deepseekAdapter.planInstall({ ...a, scope: 'user' }))
    await expect(deepseekAdapter.planInstall(a)).rejects.toThrow('wot mcp remove')
  })
  it('preserves updated JSON and bridge, detects stale/missing registration, and allows explicit re-registration', async () => {
    const context = await setup()
    await applyChangePlan(await deepseekAdapter.planInstall(context))
    const path = join(context.cwd, '.dsh/wot-ui.json')
    await writeFile(path, `${await readFile(path, 'utf8')}\n`)
    expect((await deepseekAdapter.inspect(context)).problem).toContain('stale')
    await applyChangePlan(await deepseekAdapter.planInstall(context))
    expect((await deepseekAdapter.inspect(context)).matches).toBe(true)
    const bridge = bridgePath(join(context.homeDir, '.dsh'))
    await writeFile(bridge, `${await readFile(bridge, 'utf8')}\n// edited\n`)
    expect((await deepseekAdapter.inspect(context)).problem).toContain('modified')
    await expect(deepseekAdapter.planInstall(context)).rejects.toThrow('Modified')
    await writeFile(path, `${await readFile(path, 'utf8')}\n`)
    const removal = await deepseekAdapter.planRemove(context)
    expect(removal.warnings.join()).toContain('modified')
    await applyChangePlan(removal)
    expect(await readFile(bridge, 'utf8')).toContain('// edited')
    expect(await readFile(path, 'utf8')).toContain('schemaVersion')
  })
  it('rolls back project and shared files and preserves concurrent writes', async () => {
    const context = await setup()
    const plan = await deepseekAdapter.planInstall(context)
    await expect(applyChangePlan(plan, { beforeCommit(_change, index) {
      if (index === 2)
        throw new Error('injected')
    } })).rejects.toThrow('rolled back 2')
    for (const change of plan.changes) await expect(readFile(change.path)).rejects.toThrow()
    await writeFile(plan.changes[0]!.path, 'concurrent')
    await expect(applyChangePlan(plan)).rejects.toThrow('Target changed')
    expect(await readFile(plan.changes[0]!.path, 'utf8')).toBe('concurrent')
  })
  it('detects desktop installations and rejects known incompatible versions', async () => {
    const context = { ...await setup(), platform: 'darwin' as const }
    const contents = join(context.homeDir, 'Applications/DeepSeek Harness.app/Contents')
    await mkdir(contents, { recursive: true })
    await writeFile(join(contents, 'Info.plist'), '<key>CFBundleShortVersionString</key><string>0.1.5</string>')
    expect((await deepseekAdapter.detect(context)).installed).toBe(true)
    expect((await deepseekAdapter.inspect(context)).problem).toContain('0.2.0-rc.2')
  })
  it('retains rollback backup when a composite project transaction cannot restore it', async () => {
    const context = await setup()
    await applyChangePlan(await deepseekAdapter.planInstall(context))
    const plan = await deepseekAdapter.planInstall({ ...context, server: createMcpServerDefinition('1.1.0') })
    await expect(applyChangePlan(plan, {
      beforeCommit(_change, index) {
        if (index === 1)
          throw new Error('commit failure')
      },
      beforeRollback() { throw new Error('rollback failure') },
    })).rejects.toThrow(/rollback incomplete.*backup:/)
  })
  it('rejects linked project and bridge targets before modifying files', async () => {
    const context = await setup()
    const outside = await setup()
    await mkdir(join(context.cwd, '.dsh'))
    await writeFile(join(outside.cwd, 'file'), printProject(server))
    await symlink(join(outside.cwd, 'file'), join(context.cwd, '.dsh/wot-ui.json'))
    await expect(deepseekAdapter.planInstall(context)).rejects.toThrow('escapes')
    await rm(join(context.cwd, '.dsh/wot-ui.json'))
    const plan = await deepseekAdapter.planInstall(context)
    const bridge = bridgePath(join(context.homeDir, '.dsh'))
    await mkdir(join(context.homeDir, '.dsh'), { recursive: true })
    await symlink(outside.cwd, join(context.homeDir, '.dsh/open-wot'))
    await expect(applyChangePlan(plan)).rejects.toThrow('outside allowed root')
    await expect(readFile(bridge)).rejects.toThrow()
  })
})

describe('project directory selection', () => {
  it('handles Git roots, worktrees, nested repos, symlinks and path boundaries', async () => {
    const context = await setup()
    const root = context.cwd
    const registration = { root, digest: digest('test') }
    await mkdir(join(root, 'child'))
    expect(await selectProject(join(root, 'child'), [registration])).toEqual(registration)
    const inner = { root: join(root, 'child'), digest: digest('inner') }
    expect(await selectProject(inner.root, [registration, inner])).toEqual(inner)
    await writeFile(join(root, '.git'), 'gitdir: worktree')
    expect(await selectProject(inner.root, [registration])).toEqual(registration)
    await expect(installRoot(inner.root)).rejects.toThrow('--cwd')
    await mkdir(join(inner.root, '.git'))
    expect(await selectProject(inner.root, [registration])).toBeUndefined()
    await symlink(inner.root, join(root, 'alias'))
    expect(await selectProject(join(root, 'alias'), [inner])).toEqual(inner)
    const sibling = await setup()
    expect(await selectProject(sibling.cwd, [registration])).toBeUndefined()
    expect(await selectProject(root, [{ ...registration, root: root.slice(0, -1) }])).toBeUndefined()
  })
})

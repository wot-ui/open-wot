import type { BridgeConfig } from '../../runtime/deepseek-project-bridge.mjs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, digest } from '../../runtime/deepseek-project-bridge.mjs'
import { createMcpServerDefinition } from '../../src/application/mcp-onboarding'
import { printProject } from '../../src/mcp/clients/deepseek-project'

const dirs: string[] = []
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'open-wot-bridge-')))
  dirs.push(root)
  await mkdir(join(root, '.dsh'))
  const source = printProject(createMcpServerDefinition())
  await writeFile(join(root, '.dsh/wot-ui.json'), source)
  const config: BridgeConfig = { schemaVersion: 1, bridgeHash: 'a'.repeat(64), projects: [{ root, digest: digest(source) }] }
  const effects: (() => Promise<void>)[] = []
  const agentEffects: (() => Promise<void>)[] = []
  const fiber = { await: vi.fn(async () => {}), dispose: vi.fn(async () => {}) }
  const agent = { session: { header: { cwd: root } }, ctx: {
    plugin: vi.fn(() => fiber),
    effect(callback: () => () => Promise<void>) {
      const release = callback()
      agentEffects.push(release)
      return release
    },
  } }
  let listener: (event: { agent: typeof agent, signal?: AbortSignal }) => Promise<void>
  const ctx = {
    on(_name: string, callback: typeof listener) { listener = callback },
    effect(callback: () => () => Promise<void>) { effects.push(callback()) },
    loader: { import: vi.fn(async (specifier: string) => specifier.endsWith('dsh-scope') ? { scopeOf: () => undefined } : {}), entries: vi.fn((): unknown[] => []) },
    tools: { schemas: vi.fn((): { name: string }[] => []) },
    logger: { warn: vi.fn() },
  }
  await apply(ctx, config)
  return { root, config, ctx, agent, fiber, effects, agentEffects, created: (signal?: AbortSignal) => listener!({ agent, signal }) }
}
describe('bridge lifecycle', () => {
  it('awaits discovery, mounts once with project cwd, and disposes on both lifecycles', async () => {
    const f = await fixture()
    let finish!: () => void
    f.fiber.await.mockImplementation(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    let done = false
    const started = f.created().then(() => {
      done = true
    })
    await vi.waitFor(() => expect(f.agent.ctx.plugin).toHaveBeenCalledOnce())
    expect(done).toBe(false)
    expect(f.agent.ctx.plugin.mock.calls[0]).toEqual([{}, expect.objectContaining({ cwd: f.root, serverName: 'wot-ui', command: 'npx' })])
    finish()
    await started
    await f.created()
    expect(f.agent.ctx.plugin).toHaveBeenCalledOnce()
    await f.agentEffects[0]!()
    expect(f.fiber.dispose).toHaveBeenCalled()
    await f.effects[0]!()
    await f.created()
    expect(f.agent.ctx.plugin).toHaveBeenCalledOnce()
  })
  it.each(['unregistered', 'stale', 'global', 'global-pending', 'malformed'])('fails closed for %s without importing a plugin', async (kind) => {
    const f = await fixture()
    if (kind === 'unregistered')
      f.config.projects = []
    if (kind === 'stale')
      f.config.projects[0]!.digest = '0'.repeat(64)
    if (kind === 'global')
      f.ctx.tools.schemas.mockReturnValue([{ name: 'mcp__wot-ui__wot_status' }])
    if (kind === 'global-pending')
      f.ctx.loader.entries.mockReturnValue([{ context: {}, options: { name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'wot-ui' } } }])
    if (kind === 'malformed')
      await writeFile(join(f.root, '.dsh/wot-ui.json'), 'SECRET')
    await f.created()
    expect(f.agent.ctx.plugin).not.toHaveBeenCalled()
    expect(JSON.stringify(f.ctx.logger.warn.mock.calls)).not.toContain('SECRET')
  })
  it('disposes partially started plugins on failure', async () => {
    const f = await fixture()
    f.fiber.await.mockRejectedValue(new Error('SECRET startup failure'))
    await f.created()
    expect(f.fiber.dispose).toHaveBeenCalledOnce()
    expect(f.ctx.logger.warn).toHaveBeenCalledOnce()
    expect(JSON.stringify(f.ctx.logger.warn.mock.calls)).not.toContain('SECRET')
  })
  it('cancels before mount and during startup, and unloads live mounts', async () => {
    const f = await fixture()
    const aborted = new AbortController()
    aborted.abort()
    await f.created(aborted.signal)
    expect(f.agent.ctx.plugin).not.toHaveBeenCalled()
    const controller = new AbortController()
    let finish!: () => void
    f.fiber.await.mockImplementation(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const started = f.created(controller.signal)
    await vi.waitFor(() => expect(f.agent.ctx.plugin).toHaveBeenCalledOnce())
    controller.abort()
    await vi.waitFor(() => expect(f.fiber.dispose).toHaveBeenCalled())
    finish()
    await started
    await f.effects[0]!()
    expect(f.fiber.dispose).toHaveBeenCalled()
  })
})

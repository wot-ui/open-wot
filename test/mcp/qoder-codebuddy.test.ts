import type { McpClientId, PlanContext } from '../../src/mcp/clients'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { applyChangePlan, mergeChangePlans } from '../../src/application/change-plan'
import { createMcpServerDefinition, planMcpInstall, resolveMcpAdapters } from '../../src/application/mcp-onboarding'
import { getMcpClientAdapter } from '../../src/mcp/clients'

const clients = ['qoder', 'qoder-cli', 'codebuddy', 'codebuddy-cli'] as const
const directories: string[] = []

async function fixture(): Promise<PlanContext> {
  const root = await mkdtemp(join(tmpdir(), 'open-wot-qoder-codebuddy-'))
  directories.push(root)
  const cwd = join(root, 'project')
  const homeDir = join(root, 'home')
  await mkdir(cwd)
  await mkdir(homeDir)
  // Match the host's PATH separator without detecting local macOS applications.
  const platform = process.platform === 'win32' ? 'win32' : 'linux'
  return { cwd, homeDir, scope: 'project', server: createMcpServerDefinition('1.2.3'), env: { PATH: '' }, platform }
}

async function put(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function putLauncher(context: PlanContext, name: string, electron = false) {
  const windows = context.platform === 'win32'
  const bin = join(context.homeDir, 'bin')
  const path = join(bin, windows ? `${name}.CMD` : name)
  const content = windows ? '@echo off\r\n' : '#!/bin/sh\n'
  await put(path, content + (electron ? `${windows ? 'set' : 'export'} ELECTRON_RUN_AS_NODE=1\n` : ''))
  if (!windows)
    await chmod(path, 0o755)
  context.env = { PATH: bin, PATHEXT: '.CMD' }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('qoder and CodeBuddy adapters', () => {
  it.each(clients)('%s preserves project JSONC and is idempotent through install/remove', async (client) => {
    const context = await fixture()
    const adapter = getMcpClientAdapter(client)
    const path = join(context.cwd, '.mcp.json')
    const original = '{\r\n  // keep me\r\n  "mcpServers": { "other": { "command": "other", "args": [] }, },\r\n  "setting": true,\r\n}\r\n'
    await put(path, original)
    await applyChangePlan(await adapter.planInstall(context))
    const content = await readFile(path, 'utf8')
    expect(content).toContain('// keep me\r\n')
    expect(content).toContain('"setting": true')
    expect(content).toContain('@wot-ui/cli@1.2.3')
    expect(await adapter.inspect(context)).toMatchObject({ matches: true, path })
    expect((await adapter.planInstall(context)).changes).toEqual([])
    const remove = await adapter.planRemove(context)
    expect(remove.warnings.join(' ')).toContain('shared')
    await applyChangePlan(remove)
    expect(await readFile(path, 'utf8')).toContain('"other"')
    expect(await readFile(path, 'utf8')).not.toContain('"wot-ui"')
    expect((await adapter.planRemove(context)).changes).toEqual([])
  })

  it.each([
    ['qoder', '.qoder/mcp.json'],
    ['qoder-cli', '.qoder/settings.json'],
    ['codebuddy', '.codebuddy/mcp.json'],
    ['codebuddy-cli', '.codebuddy/.mcp.json'],
  ] as const)('%s uses its own user configuration', async (client, relativePath) => {
    const context = { ...await fixture(), scope: 'user' as const }
    const adapter = getMcpClientAdapter(client)
    const path = join(context.homeDir, relativePath)
    const plan = await adapter.planInstall(context)
    expect(plan.changes.map(change => change.path)).toEqual([path])
    await applyChangePlan(plan)
    expect(await adapter.inspect(context)).toMatchObject({ path, matches: true })
    await expect(readFile(join(context.cwd, '.mcp.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['.codebuddy.json', '.codebuddy/mcp.json', '.codebuddy/.mcp.json'])('reuses existing CodeBuddy CLI user file %s', async (relativePath) => {
    const context = { ...await fixture(), scope: 'user' as const }
    const path = join(context.homeDir, relativePath)
    await put(path, '{ "otherSetting": true }')
    const adapter = getMcpClientAdapter('codebuddy-cli')
    expect((await adapter.planInstall(context)).changes[0].path).toBe(path)
    await applyChangePlan(await adapter.planInstall(context))
    expect(await adapter.inspect(context)).toMatchObject({ path, matches: true })
    await applyChangePlan(await adapter.planRemove(context))
    expect(await readFile(path, 'utf8')).toContain('otherSetting')
    expect((await adapter.planInstall(context)).changes[0].path).toBe(path)
  })

  it('keeps CodeBuddy CLI priority stable when multiple files exist or the preferred one is malformed', async () => {
    const context = { ...await fixture(), scope: 'user' as const }
    const preferred = join(context.homeDir, '.codebuddy', '.mcp.json')
    const legacy = join(context.homeDir, '.codebuddy', 'mcp.json')
    await put(preferred, 'broken')
    await put(legacy, '{"keep":true}')
    const adapter = getMcpClientAdapter('codebuddy-cli')
    await expect(adapter.planInstall(context)).rejects.toThrow('Invalid JSONC')
    await expect(adapter.planRemove(context)).rejects.toThrow('Invalid JSONC')
    expect(await adapter.inspect(context)).toMatchObject({ path: preferred, matches: false })
    expect(await readFile(legacy, 'utf8')).toBe('{"keep":true}')
    await put(preferred, '{}')
    expect((await adapter.planInstall(context)).changes[0].path).toBe(preferred)
  })

  it('reuses the legacy CodeBuddy CLI project file until the preferred file exists', async () => {
    const context = await fixture()
    const adapter = getMcpClientAdapter('codebuddy-cli')
    await put(join(context.cwd, 'mcp.json'), '{}')
    expect((await adapter.planInstall(context)).changes[0].path).toBe(join(context.cwd, 'mcp.json'))
    await put(join(context.cwd, '.mcp.json'), '{}')
    expect((await adapter.planInstall(context)).changes[0].path).toBe(join(context.cwd, '.mcp.json'))
  })

  it('does not detect new clients from shared project files', async () => {
    const context = await fixture()
    await put(join(context.cwd, '.mcp.json'), '{}')
    await put(join(context.cwd, 'AGENTS.md'), 'rules')
    for (const client of clients)
      expect((await getMcpClientAdapter(client).detect(context)).installed).toBe(false)
    expect((await resolveMcpAdapters('auto', context)).map(adapter => adapter.id)).toEqual(['claude'])
  })

  it('does not mistake a CLI legacy user file for an installed CodeBuddy IDE', async () => {
    const context = await fixture()
    await put(join(context.homeDir, '.codebuddy', 'mcp.json'), '{}')
    expect((await getMcpClientAdapter('codebuddy').detect(context)).installed).toBe(false)
    await putLauncher(context, 'codebuddy')
    expect((await resolveMcpAdapters('auto', context)).map(adapter => adapter.id)).toEqual(['codebuddy-cli'])
    await putLauncher(context, 'buddy')
    await expect(resolveMcpAdapters('auto', context)).rejects.toThrow('Multiple MCP clients detected (codebuddy, codebuddy-cli)')
  })

  it.each([
    ['buddy', 'codebuddy'],
    ['codebuddy', 'codebuddy-cli'],
    ['cbc', 'codebuddy-cli'],
    ['qodercli', 'qoder-cli'],
  ] as const)('detects the %s executable as %s including Windows shims', async (name, client) => {
    const context = await fixture()
    const bin = join(context.homeDir, 'bin')
    const executable = join(bin, `${name}.CMD`)
    await put(executable, '@echo off\n')
    const detected = { ...context, platform: 'win32' as const, env: { PATH: bin, PATHEXT: '.CMD' } }
    expect(await getMcpClientAdapter(client).detect(detected)).toMatchObject({ installed: true, executable })
  })

  it.each(['EXE', 'CMD'])('does not classify an unknown Windows qoder.%s as CLI', async (extension) => {
    const context = await fixture()
    const bin = join(context.homeDir, 'Programs', 'Qoder')
    await put(join(bin, `qoder.${extension}`), extension === 'EXE' ? 'MZ\u0000opaque native binary' : '@echo off\r\n')
    const detected = { ...context, platform: 'win32' as const, env: { PATH: bin, PATHEXT: `.${extension}` } }
    for (const client of ['qoder', 'qoder-cli'] as const)
      expect((await getMcpClientAdapter(client).detect(detected)).installed).toBe(false)
    await expect(resolveMcpAdapters('auto', detected)).rejects.toThrow('No supported MCP client detected')
    expect((await resolveMcpAdapters('qoder', detected))[0].id).toBe('qoder')
  })

  it('recognizes a Qoder CLI npm shim from its package path', async () => {
    const context = await fixture()
    const bin = join(context.homeDir, 'bin')
    await put(join(bin, 'qoder.CMD'), '@echo off\r\nnode "%~dp0\\node_modules\\@qoder-ai\\qodercli\\bin\\cli.js" %*\r\n')
    const detected = { ...context, platform: 'win32' as const, env: { PATH: bin, PATHEXT: '.CMD' } }
    expect((await getMcpClientAdapter('qoder-cli').detect(detected)).installed).toBe(true)
    expect((await getMcpClientAdapter('qoder').detect(detected)).installed).toBe(false)
  })

  it('distinguishes a Qoder IDE Electron launcher from the CLI', async () => {
    const context = await fixture()
    await putLauncher(context, 'qoder', true)
    expect((await getMcpClientAdapter('qoder').detect(context)).installed).toBe(true)
    expect((await getMcpClientAdapter('qoder-cli').detect(context)).installed).toBe(false)
  })

  it('uses QODER_CONFIG_DIR without changing IDE paths or bypassing symlink checks', async () => {
    const context = { ...await fixture(), scope: 'user' as const }
    const root = join(context.homeDir, 'custom')
    context.env = { PATH: '', QODER_CONFIG_DIR: root }
    const adapter = getMcpClientAdapter('qoder-cli')
    const plan = await adapter.planInstall(context)
    expect(plan.changes[0]).toMatchObject({ path: join(root, 'settings.json'), allowedRoot: root })
    await applyChangePlan(plan)
    expect((await adapter.inspect(context)).matches).toBe(true)
    expect((await getMcpClientAdapter('qoder').planInstall(context)).changes[0].path).toBe(join(context.homeDir, '.qoder', 'mcp.json'))
    const outside = join(context.homeDir, 'outside.json')
    await put(outside, '{}')
    await rm(join(root, 'settings.json'))
    await symlink(outside, join(root, 'settings.json'))
    await expect(applyChangePlan(await adapter.planInstall(context))).rejects.toThrow(/outside allowed root|symbolic link/)
    expect(await readFile(outside, 'utf8')).toBe('{}')
  })

  it.each(clients)('%s rejects malformed configuration and disabled or non-stdio entries', async (client) => {
    const context = await fixture()
    const path = join(context.cwd, '.mcp.json')
    const adapter = getMcpClientAdapter(client)
    await put(path, '{broken')
    await expect(adapter.planInstall(context)).rejects.toThrow('Invalid JSONC')
    for (const extra of [{ disabled: true }, { type: 'http' }]) {
      await put(path, JSON.stringify({ mcpServers: { 'wot-ui': { ...context.server, ...extra } } }))
      expect(await adapter.inspect(context)).toMatchObject({ configured: true, matches: false, problem: expect.any(String) })
    }
  })

  it('merges identical shared project MCP writes across all clients', async () => {
    const context = await fixture()
    const plans = await Promise.all(clients.map(client => getMcpClientAdapter(client).planInstall(context)))
    expect(mergeChangePlans('Install', plans).changes).toHaveLength(1)
    // Also verify the application-level all selection with its normal server definition.
    const all = mergeChangePlans('All', await planMcpInstall('all', context))
    expect(all.changes.filter(change => change.path === join(context.cwd, '.mcp.json'))).toHaveLength(1)
  })

  it.each(clients)('%s keeps client registration unverified', async (client: McpClientId) => {
    const context = await fixture()
    const adapter = getMcpClientAdapter(client)
    await applyChangePlan(await adapter.planInstall(context))
    expect(await adapter.verifyRegistration(context, await adapter.inspect(context))).toMatchObject({ status: 'unsupported', action: expect.any(String) })
  })
})

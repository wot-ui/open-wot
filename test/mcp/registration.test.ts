import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeAdapter } from '../../src/mcp/clients/claude'
import { runClientCommand } from '../../src/mcp/clients/client-command'
import { codexAdapter } from '../../src/mcp/clients/codex'
import { findExecutable } from '../../src/mcp/clients/detect'
import { opencodeAdapter } from '../../src/mcp/clients/opencode'

vi.mock('../../src/mcp/clients/client-command', () => ({
  runClientCommand: vi.fn(),
  clientCommandOutput: (result: { stdout: string, stderr: string }) => `${result.stdout}\n${result.stderr}`.trim(),
}))

vi.mock('../../src/mcp/clients/detect', () => ({
  findExecutable: vi.fn(),
}))

const context = {
  cwd: '/project',
  homeDir: '/home/test',
  scope: 'project' as const,
  server: { command: 'npx', args: ['-y', '@wot-ui/cli', 'mcp'] },
  env: { PATH: '/bin' },
  platform: 'linux' as const,
}

const state = {
  client: 'claude' as const,
  displayName: 'Claude Code',
  scope: 'project' as const,
  path: '/project/.mcp.json',
  exists: true,
  configured: true,
  matches: true,
  server: context.server,
}

describe('client registration verification', () => {
  beforeEach(() => {
    vi.mocked(findExecutable).mockResolvedValue('/bin/client')
  })

  it('reports pending Claude project approval', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 0,
      stdout: '⏸ Pending approval',
      stderr: '',
      timedOut: false,
    })

    await expect(claudeAdapter.verifyRegistration(context, state)).resolves.toMatchObject({
      status: 'pending',
      action: expect.stringContaining('approve'),
    })
  })

  it('reports a Codex registration returned as JSON', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ name: 'wot-ui', enabled: true }),
      stderr: '',
      timedOut: false,
    })

    await expect(codexAdapter.verifyRegistration(context, { ...state, client: 'codex', displayName: 'Codex', path: '/project/.codex/config.toml' })).resolves.toMatchObject({
      status: 'ready',
    })
  })

  it('reports a connected OpenCode registration and forwards the timeout', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 0,
      stdout: '● wot-ui connected',
      stderr: '',
      timedOut: false,
    })

    await expect(opencodeAdapter.verifyRegistration(
      context,
      { ...state, client: 'opencode', displayName: 'OpenCode', path: '/project/opencode.json' },
      { timeoutMs: 432 },
    )).resolves.toMatchObject({ status: 'ready' })
    expect(runClientCommand).toHaveBeenCalledWith('/bin/client', ['mcp', 'list'], expect.objectContaining({ timeoutMs: 432 }))
  })

  it('reports a disconnected OpenCode registration without exposing command output', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 0,
      stdout: 'wot-ui error API_TOKEN=super-secret',
      stderr: '',
      timedOut: false,
    })

    const registration = await opencodeAdapter.verifyRegistration(
      context,
      { ...state, client: 'opencode', displayName: 'OpenCode', path: '/project/opencode.json' },
    )
    expect(registration).toMatchObject({ status: 'failed', message: expect.stringContaining('not ready') })
    expect(JSON.stringify(registration)).not.toContain('super-secret')
  })

  it('does not report an uninitialized OpenCode registration as ready', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 0,
      stdout: '○ wot-ui not initialized\n    npx -y @wot-ui/cli mcp',
      stderr: '',
      timedOut: false,
    })

    await expect(opencodeAdapter.verifyRegistration(
      context,
      { ...state, client: 'opencode', displayName: 'OpenCode', path: '/project/opencode.json' },
    )).resolves.toMatchObject({
      status: 'failed',
      message: expect.stringContaining('not ready'),
    })
  })

  it('ignores another OpenCode server that is pending approval', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 0,
      stdout: '○ other pending approval\n● wot-ui connected',
      stderr: '',
      timedOut: false,
    })

    await expect(opencodeAdapter.verifyRegistration(
      context,
      { ...state, client: 'opencode', displayName: 'OpenCode', path: '/project/opencode.json' },
    )).resolves.toMatchObject({ status: 'ready' })
  })

  it('reports approval pending for the OpenCode wot-ui server itself', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 0,
      stdout: '○ wot-ui pending approval\n● other connected',
      stderr: '',
      timedOut: false,
    })

    await expect(opencodeAdapter.verifyRegistration(
      context,
      { ...state, client: 'opencode', displayName: 'OpenCode', path: '/project/opencode.json' },
    )).resolves.toMatchObject({ status: 'pending' })
  })

  it('rejects disabled Codex registrations and forwards the remaining doctor timeout', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ name: 'wot-ui', enabled: false }),
      stderr: '',
      timedOut: false,
    })

    await expect(codexAdapter.verifyRegistration(
      context,
      { ...state, client: 'codex', displayName: 'Codex', path: '/project/.codex/config.toml' },
      { timeoutMs: 321 },
    )).resolves.toMatchObject({
      status: 'failed',
      message: expect.stringContaining('disabled'),
    })
    expect(runClientCommand).toHaveBeenCalledWith('/bin/client', ['mcp', 'get', 'wot-ui', '--json'], expect.objectContaining({ timeoutMs: 321 }))
  })

  it('rejects Codex registrations whose filters exclude a required tool', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 0,
      stdout: JSON.stringify({ name: 'wot-ui', enabled: true, enabled_tools: ['wot_status'] }),
      stderr: '',
      timedOut: false,
    })

    await expect(codexAdapter.verifyRegistration(context, { ...state, client: 'codex', displayName: 'Codex', path: '/project/.codex/config.toml' })).resolves.toMatchObject({
      status: 'failed',
      message: expect.stringContaining('wot_list'),
    })
  })

  it('reports a timed out client command as failed instead of pending', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      stdout: '',
      stderr: '',
      timedOut: true,
      error: 'Client command timed out after 100ms',
    })

    await expect(claudeAdapter.verifyRegistration(context, state)).resolves.toMatchObject({
      status: 'failed',
      message: expect.stringContaining('timed out'),
    })
  })

  it('requires explicit trust evidence before reporting pending', async () => {
    vi.mocked(runClientCommand).mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'unexpected client failure',
      timedOut: false,
    })
    await expect(codexAdapter.verifyRegistration(context, { ...state, client: 'codex', displayName: 'Codex', path: '/project/.codex/config.toml' })).resolves.toMatchObject({
      status: 'failed',
    })

    vi.mocked(runClientCommand).mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'Project is not trusted',
      timedOut: false,
    })
    await expect(codexAdapter.verifyRegistration(context, { ...state, client: 'codex', displayName: 'Codex', path: '/project/.codex/config.toml' })).resolves.toMatchObject({
      status: 'pending',
    })
  })

  it('treats a matching project config hidden by Codex trust as pending', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Error: No MCP server named \'wot-ui\' found.',
      timedOut: false,
    })

    await expect(codexAdapter.verifyRegistration(
      context,
      { ...state, client: 'codex', displayName: 'Codex', path: '/project/.codex/config.toml' },
    )).resolves.toMatchObject({
      status: 'pending',
      message: expect.stringContaining('project-level'),
      action: expect.stringMatching(/trust.*project/i),
    })
  })

  it('does not infer project trust for a missing user-level Codex registration', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Error: No MCP server named \'wot-ui\' found.',
      timedOut: false,
    })

    await expect(codexAdapter.verifyRegistration(
      { ...context, scope: 'user' },
      { ...state, client: 'codex', displayName: 'Codex', scope: 'user', path: '/home/test/.codex/config.toml' },
    )).resolves.toMatchObject({
      status: 'failed',
    })
  })

  it('does not expose unexpected client command output in failure messages', async () => {
    vi.mocked(runClientCommand).mockResolvedValue({
      exitCode: 1,
      stdout: 'API_TOKEN=super-secret',
      stderr: 'unexpected client failure',
      timedOut: false,
    })

    const registration = await codexAdapter.verifyRegistration(context, { ...state, client: 'codex', displayName: 'Codex', path: '/project/.codex/config.toml' })
    expect(registration).toMatchObject({ status: 'failed', message: 'Codex did not recognize the wot-ui MCP server' })
    expect(JSON.stringify(registration)).not.toContain('super-secret')
  })
})

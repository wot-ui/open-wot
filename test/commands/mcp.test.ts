import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerMcpCommand } from '../../src/commands/mcp'
import { startMcpServer } from '../../src/mcp/server'
import { joinedStdout, runCli, setupCliIo } from '../helpers/cli'

vi.mock('../../src/mcp/server', () => ({
  startMcpServer: vi.fn(async () => {}),
}))

describe('mcp command', () => {
  const { stdout } = setupCliIo()
  const directories: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
  })

  it('starts mcp server', async () => {
    const program = new Command()
    registerMcpCommand(program)

    await runCli(program, ['mcp'])

    expect(startMcpServer).toHaveBeenCalledOnce()
  })

  it('supports the explicit serve alias', async () => {
    const program = new Command()
    registerMcpCommand(program)

    await runCli(program, ['mcp', 'serve'])

    expect(startMcpServer).toHaveBeenCalledOnce()
  })

  it('previews and idempotently writes Cursor config', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-command-'))
    directories.push(cwd)

    const dryRunProgram = new Command()
    registerMcpCommand(dryRunProgram)
    await runCli(dryRunProgram, ['mcp', 'init', '--client', 'cursor', '--cwd', cwd, '--dry-run'])
    await expect(readFile(join(cwd, '.cursor', 'mcp.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect(joinedStdout(stdout)).toContain('Dry run')

    stdout.mockClear()
    const applyProgram = new Command()
    registerMcpCommand(applyProgram)
    await runCli(applyProgram, ['mcp', 'init', '--client', 'cursor', '--cwd', cwd, '--yes'])
    expect(await readFile(join(cwd, '.cursor', 'mcp.json'), 'utf8')).toContain('"wot-ui"')

    stdout.mockClear()
    const repeatProgram = new Command()
    registerMcpCommand(repeatProgram)
    await runCli(repeatProgram, ['mcp', 'init', '--client', 'cursor', '--cwd', cwd, '--yes'])
    expect(joinedStdout(stdout)).toContain('No changes required')
  })

  it('prints a client-specific snippet without writing files', async () => {
    const program = new Command()
    registerMcpCommand(program)

    await runCli(program, ['mcp', 'print', '--client', 'vscode'])

    expect(joinedStdout(stdout)).toContain('"servers"')
    expect(joinedStdout(stdout)).toContain('@wot-ui/cli')
  })

  it('never exposes unrelated MCP secrets in dry-run output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-secret-command-'))
    directories.push(cwd)
    await mkdir(join(cwd, '.cursor'), { recursive: true })
    await writeFile(join(cwd, '.cursor', 'mcp.json'), JSON.stringify({
      mcpServers: {
        private: { command: 'private', env: { API_TOKEN: 'super-secret' } },
      },
    }))

    const jsonProgram = new Command()
    registerMcpCommand(jsonProgram)
    await runCli(jsonProgram, ['mcp', 'init', '--client', 'cursor', '--cwd', cwd, '--dry-run', '--format', 'json'])
    const jsonOutput = joinedStdout(stdout)
    expect(jsonOutput).not.toContain('super-secret')
    expect(jsonOutput).not.toContain('"before"')
    expect(jsonOutput).not.toContain('"after"')

    stdout.mockClear()
    const textProgram = new Command()
    registerMcpCommand(textProgram)
    await runCli(textProgram, ['mcp', 'init', '--client', 'cursor', '--cwd', cwd, '--dry-run'])
    expect(joinedStdout(stdout)).not.toContain('super-secret')
    expect(joinedStdout(stdout)).toContain('mcpServers.wot-ui')
  })

  it('does not serialize configured server environment values in status output', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-status-secret-'))
    directories.push(cwd)
    await mkdir(join(cwd, '.cursor'), { recursive: true })
    await writeFile(join(cwd, '.cursor', 'mcp.json'), JSON.stringify({
      mcpServers: {
        'wot-ui': {
          command: 'npx',
          args: ['-y', '@wot-ui/cli', 'mcp'],
          env: { API_TOKEN: 'super-secret' },
        },
      },
    }))

    const program = new Command()
    registerMcpCommand(program)
    await runCli(program, ['mcp', 'status', '--client', 'cursor', '--cwd', cwd, '--format', 'json'])

    expect(joinedStdout(stdout)).not.toContain('super-secret')
    expect(joinedStdout(stdout)).not.toContain('API_TOKEN')
  })

  it('rejects invalid doctor timeout values', async () => {
    const program = new Command()
    registerMcpCommand(program)

    await runCli(program, ['mcp', 'doctor', '--client', 'cursor', '--timeout', '-1', '--format', 'json'])

    expect(joinedStdout(stdout)).toContain('Invalid --timeout')
    expect(process.exitCode).toBe(1)
  })
})

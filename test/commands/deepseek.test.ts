import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerAgentCommand } from '../../src/commands/agent'
import { registerMcpCommand } from '../../src/commands/mcp'
import { joinedStdout, runCli, setupCliIo } from '../helpers/cli'

describe('deepSeek CLI', () => {
  const { stdout } = setupCliIo()
  const directories: string[] = []
  async function setup(): Promise<string> {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-deepseek-cli-'))
    directories.push(cwd)
    vi.stubEnv('DSH_HOME', join(cwd, 'dsh-home'))
    return cwd
  }
  async function run(args: string[]): Promise<void> {
    const program = new Command()
    registerAgentCommand(program)
    registerMcpCommand(program)
    stdout.mockClear()
    process.exitCode = undefined
    await runCli(program, args)
  }
  afterEach(async () => {
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
  })

  it('covers dry-run, explicit scope, init, status, print, and remove JSON', async () => {
    const cwd = await setup()
    const target = join(cwd, 'dsh-home/cordis.patch.yml')
    const options = ['--client', 'deepseek', '--scope', 'user', '--cwd', cwd, '--format', 'json']
    await run(['agent', 'init', ...options, '--dry-run'])
    expect(JSON.parse(joinedStdout(stdout)).dryRun).toBe(true)
    await expect(readFile(target)).rejects.toThrow()
    await run(['agent', 'init', ...options, '--yes'])
    expect(JSON.parse(joinedStdout(stdout)).plan.changes.length).toBeGreaterThan(1)
    await run(['agent', 'init', ...options, '--yes'])
    expect(JSON.parse(joinedStdout(stdout)).plan.changes).toEqual([])
    await run(['agent', 'status', ...options])
    expect(JSON.parse(joinedStdout(stdout)).clients[0].capabilities.skill.status).toBe('pass')
    await run(['mcp', 'print', '--client', 'deepseek', '--scope', 'user', '--pin', '1.1.0'])
    expect(joinedStdout(stdout)).toContain('@wot-ui/cli@1.1.0')
    await run(['agent', 'remove', ...options, '--yes'])
    expect(await readFile(target, 'utf8')).not.toContain('open-wot-mcp')
    await run(['agent', 'remove', ...options, '--yes'])
    expect(JSON.parse(joinedStdout(stdout)).plan.changes).toEqual([])
    await run(['agent', 'init', '--client', 'deepseek', '--cwd', cwd, '--format', 'json', '--yes'])
    expect(process.exitCode).toBeUndefined()
    expect(await readFile(join(cwd, '.dsh/wot-ui.json'), 'utf8')).toContain('schemaVersion')
  })

  it('requires confirmation in noninteractive sessions and reports Skill root issues', async () => {
    const cwd = await setup()
    await run(['agent', 'init', '--client', 'deepseek', '--scope', 'user', '--cwd', cwd, '--format', 'json'])
    expect(process.exitCode).toBe(1)
    expect(joinedStdout(stdout)).toContain('--yes')
    await mkdir(join(cwd, '.git'))
    const child = join(cwd, 'child')
    await mkdir(child)
    for (const operation of ['status', 'doctor']) {
      await run(['agent', operation, '--client', 'deepseek', '--scope', 'user', '--with', 'skill', '--cwd', child])
      expect(process.exitCode).toBe(1)
      expect(joinedStdout(stdout)).toContain('--cwd')
    }
    // A malformed YAML error cannot leak source values into CLI JSON.
    await mkdir(join(cwd, 'dsh-home'))
    await writeFile(join(cwd, 'dsh-home/cordis.patch.yml'), '- password: [SECRET_TOKEN')
    await run(['mcp', 'status', '--client', 'deepseek', '--scope', 'user', '--cwd', cwd, '--format', 'json'])
    expect(joinedStdout(stdout)).not.toContain('SECRET_TOKEN')
    expect(joinedStdout(stdout)).toContain('Invalid DeepSeek YAML')
  })
})

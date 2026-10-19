import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { afterEach, describe, expect, it } from 'vitest'
import { registerAgentCommand } from '../../src/commands/agent'
import { joinedStdout, runCli, setupCliIo } from '../helpers/cli'

describe('agent command', () => {
  const { stdout } = setupCliIo()
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
  })

  it('installs Skill and instructions without MCP when requested', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-agent-command-'))
    directories.push(cwd)
    const program = new Command()
    registerAgentCommand(program)

    await runCli(program, ['agent', 'init', '--client', 'cursor', '--with', 'skill,instructions', '--cwd', cwd, '--yes'])

    expect(await readFile(join(cwd, '.agents', 'skills', 'wot-ui-v2', 'SKILL.md'), 'utf8')).toContain('Wot UI V2 Skill')
    expect(await readFile(join(cwd, 'AGENTS.md'), 'utf8')).toContain('open-wot agent instructions start')
    expect(joinedStdout(stdout)).toContain('Initialize wot-ui Agent integration')
  })

  it('deduplicates shared Skill and instructions for all non-Claude clients', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-agent-all-'))
    directories.push(cwd)
    const program = new Command()
    registerAgentCommand(program)

    await runCli(program, ['agent', 'init', '--client', 'all', '--with', 'skill,instructions', '--cwd', cwd, '--yes'])

    const instructions = await readFile(join(cwd, 'AGENTS.md'), 'utf8')
    expect(instructions.match(/open-wot agent instructions start/g)).toHaveLength(1)
  })

  it('previews all clients from a Git subdirectory with a visible DeepSeek skip warning', async () => {
    const root = await mkdtemp(join(tmpdir(), 'open-wot-agent-subdir-'))
    directories.push(root)
    const cwd = join(root, 'sub')
    await mkdir(join(root, '.git'))
    await mkdir(cwd)
    for (const action of ['init', 'remove']) {
      stdout.mockClear()
      const program = new Command()
      registerAgentCommand(program)
      await runCli(program, ['agent', action, '--client', 'all', '--with', 'mcp', '--cwd', cwd, '--dry-run', '--format', 'json'])
      expect(process.exitCode).toBeUndefined()
      const output = JSON.parse(joinedStdout(stdout))
      expect(output.dryRun).toBe(true)
      expect(output.plan.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Skipped DeepSeek:')]))
      if (action === 'init')
        expect(output.plan.changes).toHaveLength(6)
    }
    await expect(readFile(join(cwd, '.cursor', 'mcp.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('status and doctor only inspect capabilities selected by --with', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-agent-capabilities-'))
    directories.push(cwd)

    const initProgram = new Command()
    registerAgentCommand(initProgram)
    await runCli(initProgram, ['agent', 'init', '--client', 'cursor', '--with', 'skill,instructions', '--cwd', cwd, '--yes'])

    stdout.mockClear()
    process.exitCode = undefined
    const statusProgram = new Command()
    registerAgentCommand(statusProgram)
    await runCli(statusProgram, ['agent', 'status', '--client', 'cursor', '--with', 'skill,instructions', '--cwd', cwd])
    expect(joinedStdout(stdout)).toContain('mcp=skipped skill=pass instructions=pass')
    expect(process.exitCode).toBeUndefined()

    stdout.mockClear()
    process.exitCode = undefined
    const doctorProgram = new Command()
    registerAgentCommand(doctorProgram)
    await runCli(doctorProgram, ['agent', 'doctor', '--client', 'cursor', '--with', 'skill,instructions', '--cwd', cwd])
    expect(joinedStdout(stdout)).toContain('mcp=skipped skill=pass instructions=pass')
    expect(process.exitCode).toBeUndefined()
  })
})

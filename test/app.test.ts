import { describe, expect, it, vi } from 'vitest'
import packageJson from '../package.json'
import { createCliProgram } from '../src/app'

describe('app cli registration', () => {
  it('registers all expected commands', () => {
    const program = createCliProgram()
    const commandNames = program.commands.map(command => command.name()).sort()

    expect(commandNames).toEqual([
      'changelog',
      'demo',
      'doc',
      'doctor',
      'info',
      'lint',
      'list',
      'mcp',
      'token',
      'usage',
    ])
  })

  it('uses package metadata on cli root', () => {
    const program = createCliProgram()
    expect(program.name()).toBe('wot')
    expect(program.version()).toBe(packageJson.version)
  })

  it('exposes -V for package version, not --version', () => {
    const program = createCliProgram()
    const versionOption = program.options.find(o => o.short === '-V')
    const longVersionOption = program.options.find(o => o.long === '--version')
    // -V should exist for printing the package version
    expect(versionOption).toBeDefined()
    // --version must NOT be on the root program (reserved for subcommand --version <ver>)
    expect(longVersionOption).toBeUndefined()
  })

  it('subcommands expose --version option for wot-ui version selection', () => {
    const program = createCliProgram()
    const queryCommands = ['info', 'doc', 'list', 'demo', 'token', 'changelog']
    for (const name of queryCommands) {
      const cmd = program.commands.find(c => c.name() === name)
      expect(cmd, `command "${name}" should exist`).toBeDefined()
      const versionOpt = cmd!.options.find(o => o.long === '--version')
      expect(versionOpt, `command "${name}" should have --version option`).toBeDefined()
    }
  })

  it('-V prints package version and exits, does not bleed into subcommands', async () => {
    const program = createCliProgram()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)

    try {
      await program.parseAsync(['-V'], { from: 'user' })
    }
    catch {
      // commander may throw after exit mock
    }

    const output = stdout.mock.calls.map(c => String(c[0])).join('')
    expect(output).toContain(packageJson.version)
    stdout.mockRestore()
    exitSpy.mockRestore()
  })
})

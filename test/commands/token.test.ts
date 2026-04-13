import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerTokenCommand } from '../../src/commands/token'
import { findComponent, listComponents } from '../../src/data/metadata'
import { writeJson, writeLine } from '../../src/utils/output'
import { runCli, setupCliIo } from '../helpers/cli'

vi.mock('../../src/data/metadata', () => ({
  findComponent: vi.fn(),
  listComponents: vi.fn(),
}))

vi.mock('../../src/utils/output', () => ({
  writeJson: vi.fn(),
  writeLine: vi.fn(),
}))

describe('token command', () => {
  const { error } = setupCliIo()

  beforeEach(() => {
    vi.mocked(findComponent).mockReturnValue({
      name: 'Button',
      cssVars: [{ name: '--wd-button-color', description: 'color', defaultValue: '#000' }],
    } as any)
    vi.mocked(listComponents).mockReturnValue([
      { name: 'Button', cssVars: [{ name: '--wd-button-color', description: 'color' }] },
    ] as any)
  })

  it('prints all tokens when no component provided', async () => {
    const program = new Command()
    registerTokenCommand(program)

    await runCli(program, ['token'])

    expect(writeJson).toHaveBeenCalledWith(expect.any(Array))
  })

  it('prints specific component tokens in json', async () => {
    const program = new Command()
    registerTokenCommand(program)

    await runCli(program, ['token', 'Button', '--format', 'json'])

    expect(writeJson).toHaveBeenCalledWith(expect.objectContaining({ name: 'Button' }))
  })

  it('reports missing component', async () => {
    vi.mocked(findComponent).mockReturnValue(undefined)

    const program = new Command()
    registerTokenCommand(program)

    await runCli(program, ['token', 'Unknown'])

    expect(error).toHaveBeenCalledWith('Component not found: Unknown')
    expect(process.exitCode).toBe(1)
  })

  it('prints text output for specific component', async () => {
    const program = new Command()
    registerTokenCommand(program)

    await runCli(program, ['token', 'Button'])

    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('--wd-button-color'))
  })
})

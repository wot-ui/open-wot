import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerInfoCommand } from '../../src/commands/info'
import { findComponent } from '../../src/data/metadata'
import { writeJson, writeLine } from '../../src/utils/output'
import { runCli, setupCliIo } from '../helpers/cli'

vi.mock('../../src/data/metadata', () => ({
  findComponent: vi.fn(),
}))

vi.mock('../../src/utils/output', () => ({
  writeJson: vi.fn(),
  writeLine: vi.fn(),
}))

describe('info command', () => {
  const { error } = setupCliIo()

  beforeEach(() => {
    vi.mocked(findComponent).mockReturnValue({
      name: 'Button',
      nameZh: '按钮',
      tag: 'wd-button',
      description: 'button',
      descriptionZh: '按钮',
      props: [{ name: 'type', type: 'string', description: 'btn type' }],
      events: [{ name: 'click', description: 'click' }],
      slots: [{ name: 'default', description: 'slot' }],
      cssVars: [{ name: '--wd-button-color', description: 'color' }],
    } as any)
  })

  it('prints component json', async () => {
    const program = new Command()
    registerInfoCommand(program)

    await runCli(program, ['info', 'Button', '--format', 'json'])

    expect(writeJson).toHaveBeenCalledWith(expect.objectContaining({ name: 'Button' }))
  })

  it('prints component text', async () => {
    const program = new Command()
    registerInfoCommand(program)

    await runCli(program, ['info', 'Button'])

    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('Props:'))
  })

  it('sets exitCode when component not found', async () => {
    vi.mocked(findComponent).mockReturnValue(undefined)
    const program = new Command()
    registerInfoCommand(program)

    await runCli(program, ['info', 'Unknown'])

    expect(error).toHaveBeenCalledWith('Component not found: Unknown')
    expect(process.exitCode).toBe(1)
  })
})

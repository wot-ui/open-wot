import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerListCommand } from '../../src/commands/list'
import { listComponents } from '../../src/data/metadata'
import { writeJson, writeLine } from '../../src/utils/output'
import { runCli, setupCliIo } from '../helpers/cli'

vi.mock('../../src/data/metadata', () => ({
  listComponents: vi.fn(),
}))

vi.mock('../../src/utils/output', () => ({
  writeJson: vi.fn(),
  writeLine: vi.fn(),
}))

describe('list command', () => {
  const { error } = setupCliIo()

  beforeEach(() => {
    vi.mocked(listComponents).mockReturnValue([
      { name: 'Button', nameZh: '按钮', tag: 'wd-button', description: 'Button', descriptionZh: '按钮组件' },
    ] as any)
  })

  it('prints json result', async () => {
    const program = new Command()
    registerListCommand(program)

    await runCli(program, ['list', '--format', 'json'])

    expect(writeJson).toHaveBeenCalledWith({ components: expect.any(Array) })
  })

  it('prints text result', async () => {
    const program = new Command()
    registerListCommand(program)

    await runCli(program, ['list'])

    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('wd-button'))
  })

  it('handles thrown errors', async () => {
    vi.mocked(listComponents).mockImplementation(() => {
      throw new Error('boom')
    })

    const program = new Command()
    registerListCommand(program)

    await runCli(program, ['list'])

    expect(error).toHaveBeenCalledWith('boom')
    expect(process.exitCode).toBe(1)
  })
})

import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDemoCommand } from '../../src/commands/demo'
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

describe('demo command', () => {
  const { error } = setupCliIo()

  beforeEach(() => {
    vi.mocked(findComponent).mockReturnValue({
      name: 'Button',
      demos: [{ name: 'basic', title: 'Basic', code: '<wd-button />' }],
    } as any)
  })

  it('prints demo list json when no demo name provided', async () => {
    const program = new Command()
    registerDemoCommand(program)

    await runCli(program, ['demo', 'Button', '--format', 'json'])

    expect(writeJson).toHaveBeenCalledWith(expect.objectContaining({ component: 'Button' }))
  })

  it('prints selected demo code', async () => {
    const program = new Command()
    registerDemoCommand(program)

    await runCli(program, ['demo', 'Button', 'basic'])

    expect(writeLine).toHaveBeenCalledWith('<wd-button />')
  })

  it('reports missing demo', async () => {
    const program = new Command()
    registerDemoCommand(program)

    await runCli(program, ['demo', 'Button', 'not-exist'])

    expect(error).toHaveBeenCalledWith('Demo not found: not-exist')
    expect(process.exitCode).toBe(1)
  })
})

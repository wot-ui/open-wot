import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDocCommand } from '../../src/commands/doc'
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

describe('doc command', () => {
  const { error } = setupCliIo()

  beforeEach(() => {
    vi.mocked(findComponent).mockReturnValue({ name: 'Button', doc: '# demo' } as any)
  })

  it('prints json doc', async () => {
    const program = new Command()
    registerDocCommand(program)

    await runCli(program, ['doc', 'Button', '--format', 'json'])

    expect(writeJson).toHaveBeenCalledWith({ name: 'Button', doc: '# demo' })
  })

  it('prints markdown doc text', async () => {
    const program = new Command()
    registerDocCommand(program)

    await runCli(program, ['doc', 'Button'])

    expect(writeLine).toHaveBeenCalledWith('# demo')
  })

  it('reports missing docs', async () => {
    vi.mocked(findComponent).mockReturnValue({ name: 'Button' } as any)

    const program = new Command()
    registerDocCommand(program)

    await runCli(program, ['doc', 'Button'])

    expect(error).toHaveBeenCalledWith('Documentation not found: Button')
    expect(process.exitCode).toBe(1)
  })

  it('passes --version option to findComponent', async () => {
    const program = new Command()
    registerDocCommand(program)

    await runCli(program, ['doc', 'Button', '--version', '2.0.0'])

    expect(findComponent).toHaveBeenCalledWith('Button', '2.0.0')
  })
})

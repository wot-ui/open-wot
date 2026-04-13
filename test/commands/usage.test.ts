import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerUsageCommand } from '../../src/commands/usage'
import { writeJson, writeLine } from '../../src/utils/output'
import { analyzeUsage } from '../../src/utils/scanner'
import { runCli, setupCliIo } from '../helpers/cli'

vi.mock('../../src/utils/scanner', () => ({
  analyzeUsage: vi.fn(),
}))

vi.mock('../../src/utils/output', () => ({
  writeJson: vi.fn(),
  writeLine: vi.fn(),
}))

describe('usage command', () => {
  const { error } = setupCliIo()

  beforeEach(() => {
    vi.mocked(analyzeUsage).mockReturnValue({
      scannedFiles: 2,
      components: [{ name: 'Button', tag: 'wd-button', count: 3, files: ['a.vue'] }],
      imports: ['@wot-ui/ui'],
    } as any)
  })

  it('prints json report', async () => {
    const program = new Command()
    registerUsageCommand(program)

    await runCli(program, ['usage', '--format', 'json'])

    expect(writeJson).toHaveBeenCalledWith(expect.objectContaining({ scannedFiles: 2 }))
  })

  it('prints text report', async () => {
    const program = new Command()
    registerUsageCommand(program)

    await runCli(program, ['usage'])

    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('Scanned files: 2'))
  })

  it('handles failures', async () => {
    vi.mocked(analyzeUsage).mockImplementation(() => {
      throw new Error('usage-fail')
    })

    const program = new Command()
    registerUsageCommand(program)

    await runCli(program, ['usage'])

    expect(error).toHaveBeenCalledWith('usage-fail')
    expect(process.exitCode).toBe(1)
  })
})

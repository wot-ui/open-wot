import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerLintCommand } from '../../src/commands/lint'
import { writeJson, writeLine } from '../../src/utils/output'
import { lintProject } from '../../src/utils/scanner'
import { runCli, setupCliIo } from '../helpers/cli'

vi.mock('../../src/utils/scanner', () => ({
  lintProject: vi.fn(),
}))

vi.mock('../../src/utils/output', () => ({
  writeJson: vi.fn(),
  writeLine: vi.fn(),
}))

describe('lint command', () => {
  const { error } = setupCliIo()

  beforeEach(() => {
    vi.mocked(lintProject).mockReturnValue({
      scannedFiles: 2,
      issues: [{ severity: 'warning', file: 'a.vue', line: 3, rule: 'unknown-component', message: 'Unknown tag' }],
    } as any)
  })

  it('prints json report', async () => {
    const program = new Command()
    registerLintCommand(program)

    await runCli(program, ['lint', '--format', 'json'])

    expect(writeJson).toHaveBeenCalledWith(expect.objectContaining({ scannedFiles: 2 }))
  })

  it('prints no-issue message', async () => {
    vi.mocked(lintProject).mockReturnValue({ scannedFiles: 1, issues: [] } as any)

    const program = new Command()
    registerLintCommand(program)

    await runCli(program, ['lint'])

    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('No lint issues found'))
  })

  it('handles failures', async () => {
    vi.mocked(lintProject).mockImplementation(() => {
      throw new Error('lint-fail')
    })

    const program = new Command()
    registerLintCommand(program)

    await runCli(program, ['lint'])

    expect(error).toHaveBeenCalledWith('lint-fail')
    expect(process.exitCode).toBe(1)
  })
})

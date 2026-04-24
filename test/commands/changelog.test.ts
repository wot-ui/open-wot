import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerChangelogCommand } from '../../src/commands/changelog'
import { loadMetadataFile } from '../../src/data/loader'
import { resolveVersion } from '../../src/data/version'
import { writeJson, writeLine } from '../../src/utils/output'
import { runCli, setupCliIo } from '../helpers/cli'

vi.mock('../../src/data/loader', () => ({
  loadMetadataFile: vi.fn(),
}))

vi.mock('../../src/data/version', () => ({
  resolveVersion: vi.fn(() => 'v2'),
  detectVersion: vi.fn(() => ({ version: '2.0.4', source: 'fallback' })),
}))

vi.mock('../../src/utils/output', () => ({
  writeJson: vi.fn(),
  writeLine: vi.fn(),
}))

describe('changelog command', () => {
  const { error } = setupCliIo()

  beforeEach(() => {
    vi.mocked(loadMetadataFile).mockReturnValue({
      changelog: [
        { version: '2.0.0', summary: 'Release 2.0.0', highlights: ['A'], components: ['Button'] },
        { version: '1.9.0', summary: 'Release 1.9.0', highlights: ['B'], components: ['Cell'] },
      ],
    } as any)
  })

  it('prints json entries', async () => {
    const program = new Command()
    registerChangelogCommand(program)

    await runCli(program, ['changelog', '--format', 'json'])

    expect(resolveVersion).toHaveBeenCalled()
    expect(writeJson).toHaveBeenCalledWith(expect.objectContaining({ entries: expect.any(Array) }))
  })

  it('filters by version', async () => {
    const program = new Command()
    registerChangelogCommand(program)

    await runCli(program, ['changelog', '2.0.0'])

    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('Release 2.0.0'))
  })

  it('handles failures', async () => {
    vi.mocked(loadMetadataFile).mockImplementation(() => {
      throw new Error('broken')
    })

    const program = new Command()
    registerChangelogCommand(program)

    await runCli(program, ['changelog'])

    expect(error).toHaveBeenCalledWith('broken')
    expect(process.exitCode).toBe(1)
  })
})

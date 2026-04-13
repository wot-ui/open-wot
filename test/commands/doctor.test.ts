import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDoctorCommand } from '../../src/commands/doctor'
import { writeJson, writeLine } from '../../src/utils/output'
import { diagnoseProject } from '../../src/utils/project'
import { runCli, setupCliIo } from '../helpers/cli'

vi.mock('../../src/utils/project', () => ({
  diagnoseProject: vi.fn(),
}))

vi.mock('../../src/utils/output', () => ({
  writeJson: vi.fn(),
  writeLine: vi.fn(),
}))

describe('doctor command', () => {
  const { error } = setupCliIo()

  beforeEach(() => {
    vi.mocked(diagnoseProject).mockReturnValue({
      dir: '/tmp/demo',
      checks: [{ status: 'ok', name: 'deps', message: 'ready' }],
    } as any)
  })

  it('prints json report', async () => {
    const program = new Command()
    registerDoctorCommand(program)

    await runCli(program, ['doctor', '--format', 'json'])

    expect(writeJson).toHaveBeenCalledWith(expect.objectContaining({ dir: '/tmp/demo' }))
  })

  it('prints text report', async () => {
    const program = new Command()
    registerDoctorCommand(program)

    await runCli(program, ['doctor'])

    expect(writeLine).toHaveBeenCalledWith(expect.stringContaining('Directory:'))
  })

  it('handles failures', async () => {
    vi.mocked(diagnoseProject).mockImplementation(() => {
      throw new Error('doctor-fail')
    })

    const program = new Command()
    registerDoctorCommand(program)

    await runCli(program, ['doctor'])

    expect(error).toHaveBeenCalledWith('doctor-fail')
    expect(process.exitCode).toBe(1)
  })
})

import { Command } from 'commander'
import { describe, expect, it, vi } from 'vitest'
import { registerMcpCommand } from '../../src/commands/mcp'
import { startMcpServer } from '../../src/mcp/server'
import { runCli } from '../helpers/cli'

vi.mock('../../src/mcp/server', () => ({
  startMcpServer: vi.fn(async () => {}),
}))

describe('mcp command', () => {
  it('starts mcp server', async () => {
    const program = new Command()
    registerMcpCommand(program)

    await runCli(program, ['mcp'])

    expect(startMcpServer).toHaveBeenCalledOnce()
  })
})

import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { clientCommandOutput, runClientCommand } from '../../src/mcp/clients/client-command'

describe('client command lifecycle', () => {
  it('redacts sensitive values from captured client output', () => {
    const output = clientCommandOutput({
      exitCode: 1,
      stdout: 'API_TOKEN=super-secret\n{"client_secret":"json-secret"}',
      stderr: 'Authorization: Bearer bearer-secret',
      timedOut: false,
    })

    expect(output).toContain('API_TOKEN=[REDACTED]')
    expect(output).not.toContain('super-secret')
    expect(output).not.toContain('json-secret')
    expect(output).not.toContain('bearer-secret')
  })

  it.skipIf(process.platform === 'win32')('escalates and reaps a command that ignores SIGTERM', async () => {
    const startedAt = Date.now()
    const result = await runClientCommand(process.execPath, [
      '-e',
      'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)',
    ], {
      cwd: process.cwd(),
      timeoutMs: 50,
    })

    expect(result).toMatchObject({ timedOut: true, error: expect.stringContaining('timed out') })
    expect(Date.now() - startedAt).toBeLessThan(500)
  })
})

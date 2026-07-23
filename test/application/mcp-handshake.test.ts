import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { resolveMcpSpawnCommand, verifyMcpHandshake } from '../../src/application/mcp-handshake'

describe('mcp handshake', () => {
  it('uses a shell for Windows command shims', () => {
    expect(resolveMcpSpawnCommand('npx', 'win32')).toEqual({ executable: 'npx.cmd', useShell: true })
    expect(resolveMcpSpawnCommand('C:\\Program Files\\nodejs\\node.exe', 'win32')).toEqual({
      executable: 'C:\\Program Files\\nodejs\\node.exe',
      useShell: false,
    })
  })

  it('reports malformed server output without crashing the process', async () => {
    const result = await verifyMcpHandshake({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("not-json\\n")'],
    }, { timeoutMs: 2_000 })

    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('initializes the real wot-ui server and lists tools', async () => {
    const result = await verifyMcpHandshake({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/index.ts', 'mcp'],
    }, {
      cwd: process.cwd(),
      timeoutMs: 15_000,
    })

    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(result.serverName).toBe('wot-ui')
    expect(result.tools).toContain('wot_list')
    expect(result.tools).toContain('wot_status')
  }, 20_000)

  it.skipIf(process.platform === 'win32')('forcefully reaps a server that ignores SIGTERM', async () => {
    const startedAt = Date.now()
    const result = await verifyMcpHandshake({
      command: process.execPath,
      args: ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'],
    }, { timeoutMs: 50 })

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('timed out') })
    expect(Date.now() - startedAt).toBeLessThan(500)
  })
})

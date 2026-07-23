import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyChangePlan } from '../../src/application/change-plan'
import { doctorMcpClients, formatMcpDoctorReport, mcpDoctorExitCode, toPublicMcpDoctorReport, validateMcpHandshake } from '../../src/application/mcp-doctor'
import { verifyMcpHandshake } from '../../src/application/mcp-handshake'
import { createPlanContext } from '../../src/application/mcp-onboarding'
import { codexAdapter } from '../../src/mcp/clients/codex'
import { cursorAdapter } from '../../src/mcp/clients/cursor'

vi.mock('../../src/application/mcp-handshake', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/application/mcp-handshake')>()
  return { ...actual, verifyMcpHandshake: vi.fn() }
})

const directories: string[] = []

afterEach(async () => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('mcp doctor', () => {
  it('requires the wot-ui server identity and core tools', () => {
    expect(validateMcpHandshake({
      ok: true,
      serverName: 'other',
      tools: ['wot_status', 'wot_list'],
      durationMs: 1,
    })).toMatchObject({ status: 'fail', message: expect.stringContaining('server name') })

    expect(validateMcpHandshake({
      ok: true,
      serverName: 'wot-ui',
      tools: ['wot_status'],
      durationMs: 1,
    })).toMatchObject({ status: 'fail', message: expect.stringContaining('wot_list') })
  })

  it('distinguishes a healthy server from an unverified client registration', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-doctor-'))
    directories.push(cwd)
    const context = createPlanContext({ cwd, homeDir: cwd, scope: 'project', env: { PATH: '' } })
    await applyChangePlan(await cursorAdapter.planInstall(context))
    vi.mocked(verifyMcpHandshake).mockResolvedValue({
      ok: true,
      serverName: 'wot-ui',
      protocolVersion: 'test',
      tools: ['wot_status', 'wot_list'],
      durationMs: 5,
    })

    const reports = await doctorMcpClients('cursor', { cwd, homeDir: cwd, scope: 'project', env: { PATH: '' } })

    expect(reports[0]).toMatchObject({
      overall: 'server-ready',
      config: { status: 'pass' },
      handshake: { status: 'pass' },
      clientRegistration: { status: 'unsupported' },
    })
    expect(mcpDoctorExitCode(reports)).toBe(0)
  })

  it('shares one total timeout between handshake and client registration', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-doctor-deadline-'))
    directories.push(cwd)
    const context = createPlanContext({ cwd, homeDir: cwd, scope: 'project', env: { PATH: '' } })
    await applyChangePlan(await codexAdapter.planInstall(context))
    vi.mocked(verifyMcpHandshake).mockResolvedValue({
      ok: true,
      serverName: 'wot-ui',
      tools: ['wot_status', 'wot_list'],
      durationMs: 300,
    })
    const registration = vi.spyOn(codexAdapter, 'verifyRegistration').mockResolvedValue({
      status: 'ready',
      message: 'ready',
    })
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_100)
      .mockReturnValueOnce(1_400)

    await doctorMcpClients('codex', { cwd, homeDir: cwd, scope: 'project', env: { PATH: '' }, timeoutMs: 1_000 })

    expect(verifyMcpHandshake).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ timeoutMs: 900 }))
    expect(registration).toHaveBeenCalledWith(expect.anything(), expect.anything(), { timeoutMs: 600 })
  })

  it('reports project trust as action-required instead of failed', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'open-wot-doctor-trust-'))
    directories.push(cwd)
    const context = createPlanContext({ cwd, homeDir: cwd, scope: 'project', env: { PATH: '' } })
    await applyChangePlan(await codexAdapter.planInstall(context))
    vi.mocked(verifyMcpHandshake).mockResolvedValue({
      ok: true,
      serverName: 'wot-ui',
      tools: ['wot_status', 'wot_list'],
      durationMs: 5,
    })
    vi.spyOn(codexAdapter, 'verifyRegistration').mockResolvedValue({
      status: 'pending',
      message: 'Codex is not loading the project-level wot-ui MCP configuration yet',
      action: 'Trust this project in Codex.',
    })

    const reports = await doctorMcpClients('codex', { cwd, homeDir: cwd, scope: 'project', env: { PATH: '' } })

    expect(reports[0]).toMatchObject({
      overall: 'action-required',
      config: { status: 'pass' },
      handshake: { status: 'pass' },
      clientRegistration: { status: 'pending' },
    })
    expect(mcpDoctorExitCode(reports)).toBe(2)
  })

  it('removes subprocess stderr and redacts public doctor messages', () => {
    const report = {
      client: 'codex' as const,
      displayName: 'Codex',
      overall: 'failed' as const,
      config: {
        status: 'pass' as const,
        state: {
          client: 'codex' as const,
          displayName: 'Codex',
          scope: 'project' as const,
          path: '/project/.codex/config.toml',
          exists: true,
          configured: true,
          matches: true,
          server: { command: 'npx', args: ['-y', '@wot-ui/cli', 'mcp'], env: { CUSTOM_ENV: 'arbitrary-secret' } },
        },
      },
      handshake: {
        status: 'fail' as const,
        result: { ok: false, tools: [], durationMs: 1, error: 'API_TOKEN=error-secret', stderr: 'TOKEN=stderr-secret' },
      },
      clientRegistration: { status: 'failed' as const, message: 'client_secret=registration-secret arbitrary-secret' },
    }

    const publicReport = toPublicMcpDoctorReport(report)
    expect(publicReport.handshake.result?.stderr).toBeUndefined()
    expect(JSON.stringify(publicReport)).not.toMatch(/error-secret|stderr-secret|registration-secret|arbitrary-secret/)
    expect(formatMcpDoctorReport(report)).not.toMatch(/error-secret|stderr-secret|registration-secret|arbitrary-secret/)
  })
})

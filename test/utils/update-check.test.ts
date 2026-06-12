import type { UpdateCheckOptions } from '../../src/utils/update-check'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { checkForCliUpdate, compareSemver, getCachedCliUpdateStatus, getCliUpdateStatus, shouldCheckForCliUpdate } from '../../src/utils/update-check'

function stripAnsi(value: string): string {
  return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '')
}

function createUpdateCheckOptions(options: Partial<UpdateCheckOptions> = {}): UpdateCheckOptions {
  const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
  return {
    args: ['node', 'wot', 'list'],
    cacheFile: join(dir, 'cache.json'),
    currentVersion: '1.0.2',
    env: {},
    fetchFn: vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.3' }),
    })),
    isTty: true,
    now: 1000,
    packageName: '@wot-ui/cli',
    stderr: { write: vi.fn() },
    ...options,
  }
}

describe('update check', () => {
  it('compares semantic versions', () => {
    expect(compareSemver('1.0.3', '1.0.2')).toBe(1)
    expect(compareSemver('v1.0.2', '1.0.2')).toBe(0)
    expect(compareSemver('1.0.1', '1.0.2')).toBe(-1)
    expect(compareSemver('latest', '1.0.2')).toBe(0)
    expect(compareSemver('1.0.0', '1.0.0-alpha')).toBe(1)
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1)
    expect(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1)
    expect(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1')).toBe(1)
    expect(compareSemver('1.0.0+build.2', '1.0.0+build.1')).toBe(0)
  })

  it('skips non-interactive and mcp startup checks', () => {
    expect(shouldCheckForCliUpdate(['node', 'wot', 'list'], {}, false)).toBe(false)
    expect(shouldCheckForCliUpdate(['node', 'wot', 'mcp'], {}, true)).toBe(false)
    expect(shouldCheckForCliUpdate(['node', 'wot', 'lint', 'mcp'], {}, true)).toBe(true)
    expect(shouldCheckForCliUpdate(['node', 'wot', 'list'], { WOT_DISABLE_UPDATE_CHECK: '1' }, true)).toBe(false)
    expect(shouldCheckForCliUpdate(['node', 'wot', 'list'], {}, true)).toBe(true)
  })

  it.each([
    { args: ['node', 'wot', 'list'], env: {}, isTty: false },
    { args: ['node', 'wot', 'mcp'], env: {}, isTty: true },
    { args: ['node', 'wot', '-V'], env: {}, isTty: true },
    { args: ['node', 'wot', '--help'], env: {}, isTty: true },
    { args: ['node', 'wot', 'list'], env: { CI: 'true' }, isTty: true },
    { args: ['node', 'wot', 'list'], env: { NODE_ENV: 'test' }, isTty: true },
    { args: ['node', 'wot', 'list'], env: { NO_UPDATE_NOTIFIER: '1' }, isTty: true },
    { args: ['node', 'wot', 'list'], env: { WOT_DISABLE_UPDATE_CHECK: 'true' }, isTty: true },
  ])('does not fetch when startup checks are skipped %#', async ({ args, env, isTty }) => {
    const fetchFn = vi.fn()
    const stderr = { write: vi.fn() }

    await checkForCliUpdate(createUpdateCheckOptions({
      args,
      env,
      fetchFn,
      isTty,
      stderr,
    }))

    expect(fetchFn).not.toHaveBeenCalled()
    expect(stderr.write).not.toHaveBeenCalled()
  })

  it('does not fetch during cli startup when cache is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const stderr = { write: vi.fn() }
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.3' }),
    }))

    checkForCliUpdate({
      args: ['node', 'wot', 'list'],
      cacheFile: join(dir, 'cache.json'),
      currentVersion: '1.0.2',
      env: {},
      fetchFn,
      isTty: true,
      now: 1000,
      packageName: '@wot-ui/cli',
      stderr,
    })

    expect(fetchFn).not.toHaveBeenCalled()
    expect(stderr.write).not.toHaveBeenCalled()
  })

  it('prints an update notice from fresh cache without fetching', () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const cacheFile = join(dir, 'cache.json')
    const stderr = { write: vi.fn() }
    const fetchFn = vi.fn()
    writeFileSync(cacheFile, `${JSON.stringify({ checkedAt: 900, latestVersion: '1.0.3' })}\n`)

    checkForCliUpdate(createUpdateCheckOptions({
      cacheFile,
      fetchFn,
      now: 1000,
      stderr,
    }))

    expect(fetchFn).not.toHaveBeenCalled()
    expect(stripAnsi(String(stderr.write.mock.calls[0]?.[0]))).toContain('1.0.2 -> 1.0.3')
  })

  it('returns structured update status for callers that do not print notices', async () => {
    const status = await getCliUpdateStatus(createUpdateCheckOptions())

    expect(status).toMatchObject({
      cached: false,
      checkedAt: 1000,
      command: 'npm install -g @wot-ui/cli',
      currentVersion: '1.0.2',
      disabled: false,
      latestVersion: '1.0.3',
      packageName: '@wot-ui/cli',
      updateAvailable: true,
    })
  })

  it('returns disabled status without fetching when update checks are disabled', async () => {
    const fetchFn = vi.fn()

    const status = await getCliUpdateStatus(createUpdateCheckOptions({
      env: { WOT_DISABLE_UPDATE_CHECK: '1' },
      fetchFn,
    }))

    expect(fetchFn).not.toHaveBeenCalled()
    expect(status).toMatchObject({
      disabled: true,
      updateAvailable: false,
    })
  })

  it('does not treat disabled env values of 0 or false as disabled', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.3' }),
    }))

    const status = await getCliUpdateStatus(createUpdateCheckOptions({
      env: { NO_UPDATE_NOTIFIER: '0', WOT_DISABLE_UPDATE_CHECK: 'false' },
      fetchFn,
    }))

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(status).toMatchObject({
      disabled: false,
      updateAvailable: true,
    })
  })

  it.each(['1.0.2', '1.0.1'])('does not print a notice for latest version %s', async (latestVersion) => {
    const stderr = { write: vi.fn() }
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const cacheFile = join(dir, 'cache.json')
    writeFileSync(cacheFile, `${JSON.stringify({ checkedAt: 900, latestVersion })}\n`)

    checkForCliUpdate(createUpdateCheckOptions({
      cacheFile,
      fetchFn: vi.fn(),
      stderr,
    }))

    expect(stderr.write).not.toHaveBeenCalled()
  })

  it('returns fresh cached cli startup status without fetching', () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const cacheFile = join(dir, 'cache.json')
    const fetchFn = vi.fn()
    writeFileSync(cacheFile, `${JSON.stringify({ checkedAt: 900, latestVersion: '1.0.3' })}\n`)

    const status = getCachedCliUpdateStatus(createUpdateCheckOptions({
      cacheFile,
      fetchFn,
      now: 1000,
    }))

    expect(fetchFn).not.toHaveBeenCalled()
    expect(status).toMatchObject({
      cached: true,
      checkedAt: 900,
      latestVersion: '1.0.3',
      updateAvailable: true,
    })
  })

  it('returns cached status without fetching when cache is fresh', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const cacheFile = join(dir, 'cache.json')
    const fetchFn = vi.fn()
    writeFileSync(cacheFile, `${JSON.stringify({ checkedAt: 900, latestVersion: '1.0.3' })}\n`)

    const status = await getCliUpdateStatus(createUpdateCheckOptions({
      cacheFile,
      fetchFn,
      now: 1000,
    }))

    expect(fetchFn).not.toHaveBeenCalled()
    expect(status).toMatchObject({
      cached: true,
      checkedAt: 900,
      latestVersion: '1.0.3',
      updateAvailable: true,
    })
  })

  it('refreshes cache when it reaches the check interval boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const cacheFile = join(dir, 'cache.json')
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.4' }),
    }))
    writeFileSync(cacheFile, `${JSON.stringify({ checkedAt: 900, latestVersion: '1.0.3' })}\n`)

    const status = await getCliUpdateStatus(createUpdateCheckOptions({
      cacheFile,
      checkIntervalMs: 100,
      fetchFn,
      now: 1000,
    }))

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(status).toMatchObject({
      cached: false,
      checkedAt: 1000,
      latestVersion: '1.0.4',
      updateAvailable: true,
    })
  })

  it('refreshes stale cache and overwrites it with the registry result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const cacheFile = join(dir, 'cache.json')
    const stderr = { write: vi.fn() }
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.4' }),
    }))
    writeFileSync(cacheFile, `${JSON.stringify({ checkedAt: 1000, latestVersion: '1.0.3' })}\n`)

    const status = await getCliUpdateStatus(createUpdateCheckOptions({
      cacheFile,
      checkIntervalMs: 100,
      fetchFn,
      now: 1200,
      stderr,
    }))

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(readFileSync(cacheFile, 'utf8')).toContain('"latestVersion": "1.0.4"')
    expect(status).toMatchObject({
      latestVersion: '1.0.4',
      updateAvailable: true,
    })
  })

  it('uses npm_config_registry when no registry option is passed', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.3' }),
    }))

    await getCliUpdateStatus(createUpdateCheckOptions({
      env: { npm_config_registry: 'https://registry.example.test/' },
      fetchFn,
    }))

    expect(fetchFn).toHaveBeenCalledWith('https://registry.example.test/@wot-ui%2fcli/latest', expect.any(Object))
  })

  it('prefers explicit registry over npm_config_registry and trims trailing slashes', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.3' }),
    }))

    await getCliUpdateStatus(createUpdateCheckOptions({
      env: { npm_config_registry: 'https://registry.example.test/' },
      fetchFn,
      registry: 'https://registry.override.test///',
    }))

    expect(fetchFn).toHaveBeenCalledWith('https://registry.override.test/@wot-ui%2fcli/latest', expect.any(Object))
  })

  it('encodes unscoped package names for registry requests', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.3' }),
    }))

    await getCliUpdateStatus(createUpdateCheckOptions({
      fetchFn,
      packageName: 'wot cli',
    }))

    expect(fetchFn).toHaveBeenCalledWith('https://registry.npmjs.org/wot%20cli/latest', expect.any(Object))
  })

  it('caches failed checks without printing a notice', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const cacheFile = join(dir, 'cache.json')
    const stderr = { write: vi.fn() }

    await getCliUpdateStatus({
      args: ['node', 'wot', 'list'],
      cacheFile,
      currentVersion: '1.0.2',
      env: {},
      fetchFn: vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })),
      isTty: true,
      now: 1000,
      packageName: '@wot-ui/cli',
      stderr,
    })

    expect(stderr.write).not.toHaveBeenCalled()
    expect(readFileSync(cacheFile, 'utf8')).toContain('"checkedAt": 1000')
  })

  it('handles invalid registry payloads as no update', async () => {
    const status = await getCliUpdateStatus(createUpdateCheckOptions({
      fetchFn: vi.fn(async () => ({
        ok: true,
        json: async () => ({ latest: '1.0.3' }),
      })),
    }))

    expect(status).toMatchObject({
      cached: false,
      checkedAt: 1000,
      updateAvailable: false,
    })
    expect(status.latestVersion).toBeUndefined()
  })

  it('ignores null cache and fetches a fresh version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const cacheFile = join(dir, 'cache.json')
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.3' }),
    }))
    writeFileSync(cacheFile, 'null')

    const status = await getCliUpdateStatus(createUpdateCheckOptions({
      cacheFile,
      fetchFn,
    }))

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(status.updateAvailable).toBe(true)
  })

  it('continues when cache cannot be written', async () => {
    const cacheFile = mkdtempSync(join(tmpdir(), 'open-wot-update-check-directory-'))

    const status = await getCliUpdateStatus(createUpdateCheckOptions({
      cacheFile,
      fetchFn: vi.fn(async () => ({
        ok: true,
        json: async () => ({ version: '1.0.3' }),
      })),
    }))

    expect(status).toMatchObject({
      cached: false,
      latestVersion: '1.0.3',
      updateAvailable: true,
    })
  })

  it('caches thrown network errors without printing a notice', async () => {
    const cacheFile = createUpdateCheckOptions().cacheFile!
    const stderr = { write: vi.fn() }

    await getCliUpdateStatus(createUpdateCheckOptions({
      cacheFile,
      fetchFn: vi.fn(async () => {
        throw new Error('network unavailable')
      }),
      stderr,
    }))

    expect(stderr.write).not.toHaveBeenCalled()
    expect(readFileSync(cacheFile, 'utf8')).toContain('"checkedAt": 1000')
  })

  it('ignores malformed cache and fetches a fresh version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-wot-update-check-'))
    const cacheFile = join(dir, 'cache.json')
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1.0.3' }),
    }))
    const stderr = { write: vi.fn() }
    writeFileSync(cacheFile, 'not json')

    const status = await getCliUpdateStatus(createUpdateCheckOptions({
      cacheFile,
      fetchFn,
      stderr,
    }))

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(status.updateAvailable).toBe(true)
  })
})

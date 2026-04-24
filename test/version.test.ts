import { describe, expect, it } from 'vitest'
import { detectVersion, getLatestVersion, resolveVersion } from '../src/data/version'

describe('version', () => {
  it('resolves undefined and v2 to the major alias key', () => {
    expect(resolveVersion()).toBe('v2')
    expect(resolveVersion('v2')).toBe('v2')
  })

  it('resolves latest to the latest stable snapshot key', () => {
    const key = resolveVersion('latest')
    expect(key).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it('resolves an exact patch version to a snapshot key', () => {
    const latest = getLatestVersion()
    expect(resolveVersion(latest)).toBe(`v${latest}`)
  })

  it('resolves a minor version to a snapshot key via versions.json', () => {
    const latest = getLatestVersion()
    const parts = latest.split('.')
    const minor = `${parts[0]}.${parts[1]}`
    expect(resolveVersion(minor)).toBe(`v${latest}`)
  })

  it('resolves a pre-release version to a snapshot key directly', () => {
    expect(resolveVersion('2.0.0-alpha.5')).toBe('v2.0.0-alpha.5')
  })

  it('throws on unsupported version', () => {
    expect(() => resolveVersion('1.0.0')).toThrowError(/Unsupported wot-ui version/)
  })

  it('getLatestVersion returns a stable semver string', () => {
    const v = getLatestVersion()
    expect(v).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('detectVersion', () => {
  it('returns flag source when flagVersion is provided', () => {
    const info = detectVersion('2.0.4')
    expect(info.version).toBe('2.0.4')
    expect(info.source).toBe('flag')
  })

  it('falls back to a version when no project context', () => {
    const info = detectVersion(undefined, '/tmp/nonexistent-project-12345')
    expect(info.source).toBe('fallback')
    expect(info.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

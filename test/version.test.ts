import { describe, expect, it } from 'vitest'
import { getLatestVersion, resolveVersion } from '../src/data/version'

describe('version', () => {
  it('resolves known aliases and supported versions to v2 dataset key', () => {
    expect(resolveVersion()).toBe('v2')
    expect(resolveVersion('v2')).toBe('v2')
    expect(resolveVersion('latest')).toBe('v2')
    expect(resolveVersion(getLatestVersion())).toBe('v2')
  })

  it('throws on unsupported version', () => {
    expect(() => resolveVersion('1.0.0')).toThrowError(/Unsupported wot-ui version/)
  })
})

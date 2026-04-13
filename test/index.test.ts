import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'

describe('package manifest', () => {
  it('exposes expected cli entry fields', () => {
    expect(packageJson.name).toBe('@wot-ui/cli')
    expect(packageJson.bin.wot).toBe('dist/index.mjs')
    expect(packageJson.exports['.']).toBe('./dist/index.mjs')
  })
})

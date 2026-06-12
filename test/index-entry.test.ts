import { afterEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../package.json'
import { createCliProgram } from '../src/app'
import { checkForCliUpdate } from '../src/utils/update-check'

const mocks = vi.hoisted(() => ({
  parseAsync: vi.fn(async () => {}),
}))

vi.mock('../src/app', () => ({
  createCliProgram: vi.fn(() => ({
    parseAsync: mocks.parseAsync,
  })),
}))

vi.mock('../src/utils/update-check', () => ({
  checkForCliUpdate: vi.fn(async () => {}),
}))

describe('cli entry', () => {
  const originalArgv = process.argv

  afterEach(() => {
    process.argv = originalArgv
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('checks for cli updates before parsing arguments', async () => {
    process.argv = ['node', 'wot', 'list']

    await import('../src/index')

    expect(checkForCliUpdate).toHaveBeenCalledWith({
      args: process.argv,
      currentVersion: packageJson.version,
      packageName: packageJson.name,
    })
    expect(createCliProgram).toHaveBeenCalledOnce()
    expect(mocks.parseAsync).toHaveBeenCalledWith(process.argv)
    expect(checkForCliUpdate).toHaveBeenCalledBefore(mocks.parseAsync)
  })
})

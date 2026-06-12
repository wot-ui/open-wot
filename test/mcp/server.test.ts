import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import packageJson from '../../package.json'
import { startMcpServer } from '../../src/mcp/server'
import { getCliUpdateStatus } from '../../src/utils/update-check'

const mocks = vi.hoisted(() => ({
  close: vi.fn(async () => {}),
  connect: vi.fn(async () => {}),
  registerPrompt: vi.fn(),
  registerTool: vi.fn(),
}))

vi.mock('@modelcontextprotocol/server', () => {
  class MockMcpServer {
    close = mocks.close
    connect = mocks.connect
    registerPrompt = mocks.registerPrompt
    registerTool = mocks.registerTool
  }

  class MockStdioServerTransport {}

  return {
    McpServer: vi.fn(MockMcpServer),
    StdioServerTransport: vi.fn(MockStdioServerTransport),
  }
})

vi.mock('../../src/utils/update-check', () => ({
  getCliUpdateStatus: vi.fn(async () => ({
    cached: false,
    command: 'npm install -g @wot-ui/cli',
    currentVersion: packageJson.version,
    disabled: false,
    packageName: packageJson.name,
    updateAvailable: false,
  })),
}))

describe('mcp server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers tools and prewarms cli update status without terminal output', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const processOn = vi.spyOn(process, 'on').mockImplementation(() => process)

    try {
      await startMcpServer()
    }
    finally {
      stdout.mockRestore()
      stderr.mockRestore()
      processOn.mockRestore()
    }

    expect(mocks.registerTool).toHaveBeenCalledWith('wot_status', expect.any(Object), expect.any(Function))
    expect(mocks.connect).toHaveBeenCalledOnce()
    expect(getCliUpdateStatus).toHaveBeenCalledWith({
      currentVersion: packageJson.version,
      packageName: packageJson.name,
    })
    expect(stdout).not.toHaveBeenCalled()
    expect(stderr).not.toHaveBeenCalled()
  })
})

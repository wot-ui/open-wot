import type { McpServer } from '@modelcontextprotocol/server'
import { Buffer } from 'node:buffer'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import packageJson from '../../package.json'
import { registerMcpTools } from '../../src/mcp/tools'

type ToolHandler = (input: Record<string, unknown>) => Promise<{ content: Array<{ text: string, type: string }>, isError?: boolean }>

function createMcpTools(options: Parameters<typeof registerMcpTools>[1] = {}): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>()
  const server = {
    registerTool: vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
      tools.set(name, handler)
    }),
  }

  registerMcpTools(server as unknown as McpServer, options)
  return tools
}

describe('mcp tools', () => {
  it('registers wot_status before component query tools', () => {
    const tools = createMcpTools()

    expect([...tools.keys()].slice(0, 3)).toEqual(['wot_status', 'wot_list', 'wot_info'])
  })

  it('registers wot_status with structured cli update status', async () => {
    const cacheFile = join(mkdtempSync(join(tmpdir(), 'open-wot-mcp-status-')), 'cache.json')
    const tools = createMcpTools({
      updateCheckOptions: {
        cacheFile,
        env: {},
        fetchFn: vi.fn(async () => ({
          ok: true,
          json: async () => ({ version: '9.9.9' }),
        })),
        now: 1000,
      },
    })

    const result = await tools.get('wot_status')!({})
    const payload = JSON.parse(result.content[0]!.text) as {
      cli: {
        command: string
        currentVersion: string
        latestVersion?: string
        updateAvailable: boolean
      }
      server: {
        name: string
        version: string
      }
    }

    expect(payload.server).toEqual({
      name: 'wot-ui',
      version: packageJson.version,
    })
    expect(payload.cli).toMatchObject({
      cached: false,
      command: 'npm install -g @wot-ui/cli',
      currentVersion: packageJson.version,
      latestVersion: '9.9.9',
      updateAvailable: true,
    })
  })

  it('returns disabled wot_status without fetching when update checks are disabled', async () => {
    const fetchFn = vi.fn()
    const tools = createMcpTools({
      updateCheckOptions: {
        env: { NO_UPDATE_NOTIFIER: '1' },
        fetchFn,
        now: 1000,
      },
    })

    const result = await tools.get('wot_status')!({})
    const payload = JSON.parse(result.content[0]!.text) as {
      cli: {
        disabled: boolean
        updateAvailable: boolean
      }
    }

    expect(fetchFn).not.toHaveBeenCalled()
    expect(payload.cli).toMatchObject({
      disabled: true,
      updateAvailable: false,
    })
  })

  it('reuses update-check cache across repeated wot_status calls', async () => {
    const cacheFile = join(mkdtempSync(join(tmpdir(), 'open-wot-mcp-status-')), 'cache.json')
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '9.9.9' }),
    }))
    const tools = createMcpTools({
      updateCheckOptions: {
        cacheFile,
        env: {},
        fetchFn,
        now: 1000,
      },
    })

    const first = await tools.get('wot_status')!({})
    const second = await tools.get('wot_status')!({})
    const firstPayload = JSON.parse(first.content[0]!.text) as { cli: { cached: boolean } }
    const secondPayload = JSON.parse(second.content[0]!.text) as { cli: { cached: boolean } }

    expect(fetchFn).toHaveBeenCalledOnce()
    expect(firstPayload.cli.cached).toBe(false)
    expect(secondPayload.cli.cached).toBe(true)
  })

  it('keeps normal component tool output focused on component data', async () => {
    const tools = createMcpTools()

    const result = await tools.get('wot_info')!({ component: 'Button', version: '2.0.0' })
    const payload = JSON.parse(result.content[0]!.text) as { name: string, updateAvailable?: boolean }

    expect(payload.name).toBe('Button')
    expect(payload).not.toHaveProperty('cli')
    expect(payload).not.toHaveProperty('updateAvailable')
  })

  it('keeps the component catalog below the response budget', async () => {
    const tools = createMcpTools()

    const result = await tools.get('wot_list')!({ version: '2.2.0' })
    const payload = JSON.parse(result.content[0]!.text) as { components: Array<Record<string, unknown>> }

    expect(Buffer.byteLength(result.content[0]!.text, 'utf8')).toBeLessThanOrEqual(20 * 1024)
    expect(payload.components.length).toBeGreaterThan(50)
    expect(Object.keys(payload.components[0]!).sort()).toEqual([
      'category',
      'description',
      'name',
      'nameZh',
      'since',
      'tag',
    ])
    expect(payload.components[0]).not.toHaveProperty('doc')
    expect(payload.components[0]).not.toHaveProperty('demos')
    expect(payload.components[0]).not.toHaveProperty('props')
  })

  it('returns demo summaries until a specific demo is requested', async () => {
    const tools = createMcpTools()

    const listResult = await tools.get('wot_demo')!({ component: 'Button', version: '2.2.0' })
    const listPayload = JSON.parse(listResult.content[0]!.text) as { demos: Array<Record<string, unknown>> }
    expect(listPayload.demos.length).toBeGreaterThan(0)
    expect(listPayload.demos[0]).not.toHaveProperty('code')

    const demoName = String(listPayload.demos[0]!.name)
    const detailResult = await tools.get('wot_demo')!({ component: 'Button', demo: demoName, version: '2.2.0' })
    const detailPayload = JSON.parse(detailResult.content[0]!.text) as Record<string, unknown>
    expect(detailPayload).toHaveProperty('code')
  })
})

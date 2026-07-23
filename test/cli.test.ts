/*
 * @Author: weisheng
 * @Date: 2026-04-11 14:48:59
 * @LastEditTime: 2026-04-11 15:37:57
 * @LastEditors: weisheng
 * @Description:
 * @FilePath: /open-wot/packages/cli/test/cli.test.ts
 * 记得注释
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCliProgram } from '../src/app'

describe('cli', () => {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    stdout.mockClear()
    error.mockClear()
    process.exitCode = undefined
  })

  it('prints component list as json', async () => {
    await createCliProgram().parseAsync(['list', '--format', 'json'], { from: 'user' })

    const output = stdout.mock.calls[0]?.[0]
    expect(typeof output).toBe('string')
    expect(output).toContain('Button')
  })

  it('prints info error for unknown component', async () => {
    await createCliProgram().parseAsync(['info', 'Unknown'], { from: 'user' })

    expect(error.mock.calls[0]?.[0]).toContain('Component not found')
    expect(process.exitCode).toBe(1)
  })

  it('--version on subcommand selects wot-ui version, not package version', async () => {
    // With Button from v2.0.0 data: should output component info, not the package version string
    await createCliProgram().parseAsync(['info', 'Button', '--version', '2.0.0'], { from: 'user' })

    const output = stdout.mock.calls.map(c => String(c[0])).join('')
    // Should contain component content, not the package version string
    expect(output).toContain('Button')
    expect(output).not.toMatch(/^\d+\.\d+\.\d+/)
    // Should not have set an error exit code
    expect(process.exitCode).not.toBe(1)
  })

  it('--version on list subcommand selects wot-ui version', async () => {
    await createCliProgram().parseAsync(['list', '--version', '2.0.0', '--format', 'json'], { from: 'user' })

    const output = stdout.mock.calls[0]?.[0]
    expect(typeof output).toBe('string')
    expect(output).toContain('Button')
  })

  it('preserves the detailed CLI list JSON contract', async () => {
    await createCliProgram().parseAsync(['list', 'button', '--version', '2.0.0', '--format', 'json'], { from: 'user' })

    const payload = JSON.parse(stdout.mock.calls.map(c => String(c[0])).join('')) as Record<string, any>
    expect({
      component: Object.keys(payload.components[0]).sort(),
      root: Object.keys(payload).sort(),
    }).toMatchInlineSnapshot(`
      {
        "component": [
          "category",
          "cssVars",
          "demos",
          "description",
          "descriptionZh",
          "doc",
          "events",
          "name",
          "nameZh",
          "props",
          "since",
          "slots",
          "tag",
        ],
        "root": [
          "components",
        ],
      }
    `)
  })

  it('preserves the detailed CLI demo-list JSON contract', async () => {
    await createCliProgram().parseAsync(['demo', 'Button', '--version', '2.0.0', '--format', 'json'], { from: 'user' })

    const payload = JSON.parse(stdout.mock.calls.map(c => String(c[0])).join('')) as Record<string, any>
    expect({
      demo: Object.keys(payload.demos[0]).sort(),
      root: Object.keys(payload).sort(),
    }).toMatchInlineSnapshot(`
      {
        "demo": [
          "code",
          "description",
          "name",
          "title",
        ],
        "root": [
          "component",
          "demos",
        ],
      }
    `)
  })
})

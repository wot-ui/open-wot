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
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    log.mockClear()
    error.mockClear()
    process.exitCode = undefined
  })

  it('prints component list as json', async () => {
    await createCliProgram().parseAsync(['list', '--format', 'json'], { from: 'user' })

    const output = log.mock.calls[0]?.[0]
    expect(typeof output).toBe('string')
    expect(output).toContain('Button')
  })

  it('prints info error for unknown component', async () => {
    await createCliProgram().parseAsync(['info', 'Unknown'], { from: 'user' })

    expect(error.mock.calls[0]?.[0]).toContain('Component not found')
    expect(process.exitCode).toBe(1)
  })
})

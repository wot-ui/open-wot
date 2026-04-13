import { Command } from 'commander'
import { describe, expect, it, vi } from 'vitest'
import {
  addQueryOptions,
  formatCssVars,
  getComponentDescription,
  getComponentLabel,
  normalizeQueryOptions,
  printError,
} from '../../src/commands/shared'
import { writeJson } from '../../src/utils/output'

vi.mock('../../src/utils/output', () => ({
  writeJson: vi.fn(),
}))

describe('shared command utilities', () => {
  it('adds common query options', () => {
    const command = addQueryOptions(new Command('demo'))
    const optionNames = command.options.map(option => option.long)
    expect(optionNames).toContain('--format')
    expect(optionNames).toContain('--lang')
    expect(optionNames).toContain('--version')
  })

  it('normalizes query options', () => {
    expect(normalizeQueryOptions({})).toEqual({ format: 'text', lang: 'zh', version: undefined })
    expect(normalizeQueryOptions({ format: 'json', lang: 'en', version: 'v2' })).toEqual({ format: 'json', lang: 'en', version: 'v2' })
  })

  it('prints error in json mode', () => {
    printError('oops', 'json')
    expect(writeJson).toHaveBeenCalledWith({ error: true, message: 'oops' })
  })

  it('formats component labels and descriptions by language', () => {
    const component = { name: 'Button', nameZh: '按钮', description: 'button', descriptionZh: '按钮' } as any
    expect(getComponentLabel(component, 'zh')).toBe('Button 按钮')
    expect(getComponentLabel(component, 'en')).toBe('Button')
    expect(getComponentDescription(component, 'zh')).toBe('按钮')
    expect(getComponentDescription(component, 'en')).toBe('button')
  })

  it('formats css variables with fallback values', () => {
    const rows = formatCssVars([
      { name: '--a', defaultValue: '#fff', description: 'A' },
      { name: '--b', token: '#000', description: 'B' },
      { name: '--c', description: 'C' },
    ] as any)

    expect(rows).toEqual([
      { name: '--a', defaultValue: '#fff', description: 'A' },
      { name: '--b', defaultValue: '#000', description: 'B' },
      { name: '--c', defaultValue: '-', description: 'C' },
    ])
  })
})

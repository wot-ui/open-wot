import { describe, expect, it } from 'vitest'
import { findComponent, listComponents } from '../src/data/metadata'

describe('metadata', () => {
  it('lists seeded v2 components', () => {
    const components = listComponents()
    expect(components).toHaveLength(1)
    expect(components[0]?.name).toBe('Button')
  })

  it('finds a component by name and tag', () => {
    expect(findComponent('Button')?.tag).toBe('wd-button')
    expect(findComponent('wd-button')?.nameZh).toBe('按钮')
  })
})

import { describe, expect, it } from 'vitest'
import { findComponent, listComponents } from '../src/data/metadata'
import { getLatestVersion } from '../src/data/version'

describe('metadata', () => {
  it('lists extracted v2 components', () => {
    const components = listComponents()
    expect(components.length).toBeGreaterThan(50)
    expect(components.some(component => component.name === 'Button')).toBe(true)
  })

  it('finds a component by name and tag', () => {
    expect(findComponent('Button')?.tag).toBe('wd-button')
    expect(findComponent('wd-button')?.nameZh).toBe('按钮')
  })

  it('lists components for the latest patch version snapshot', () => {
    const latest = getLatestVersion()
    const components = listComponents(latest)
    expect(components.length).toBeGreaterThan(50)
  })
})

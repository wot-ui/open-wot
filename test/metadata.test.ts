import { describe, expect, it } from 'vitest'
import { filterComponents, findComponent, listComponents, toComponentSummary, toDemoSummary } from '../src/data/metadata'
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

  it('filters components by names, tags, categories, and descriptions', () => {
    const components = listComponents('2.2.0')

    expect(filterComponents(components, 'button').some(component => component.name === 'Button')).toBe(true)
    expect(filterComponents(components, '按钮').some(component => component.name === 'Button')).toBe(true)
    expect(filterComponents(components, 'wd-button').map(component => component.name)).toContain('Button')
    expect(filterComponents(components, '  ')).toBe(components)
  })

  it('creates component and demo summaries without large content fields', () => {
    const component = findComponent('Button', '2.2.0')!
    const componentSummary = toComponentSummary(component)
    const demoSummary = toDemoSummary(component.demos![0]!)

    expect(componentSummary).not.toHaveProperty('doc')
    expect(componentSummary).not.toHaveProperty('props')
    expect(demoSummary).not.toHaveProperty('code')
  })
})

import type { ComponentMeta } from '../src/types'
import { describe, expect, it } from 'vitest'
import { filterComponents, findComponent, listComponents, toComponentSummary, toDemoSummary } from '../src/data/metadata'
import { getLatestVersion } from '../src/data/version'

const searchableComponent: ComponentMeta = {
  name: 'AlphaWidget',
  nameZh: '甲组件',
  tag: 'wd-alpha-widget',
  category: 'form-controls',
  description: 'accepts user input',
  descriptionZh: '接收用户输入',
  since: '2.0.0',
  props: [],
  events: [],
  slots: [],
  cssVars: [],
}

const unrelatedComponent: ComponentMeta = {
  ...searchableComponent,
  name: 'BetaWidget',
  nameZh: '乙组件',
  tag: 'wd-beta-widget',
  category: 'navigation',
  description: 'opens another page',
  descriptionZh: '打开其他页面',
}

const filterCandidates = [searchableComponent, unrelatedComponent]

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

  it.each([
    ['name', 'alphawidget'],
    ['Chinese name', '甲组件'],
    ['tag', 'wd-alpha-widget'],
    ['category', 'form-'],
    ['description', 'user input'],
    ['Chinese description', '用户输入'],
  ])('filters components by %s', (_field, keyword) => {
    expect(filterComponents(filterCandidates, keyword)).toEqual([searchableComponent])
  })

  it('returns the original component list for a blank keyword', () => {
    expect(filterComponents(filterCandidates, '  ')).toBe(filterCandidates)
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

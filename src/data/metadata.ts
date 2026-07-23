import type { ComponentMeta, ComponentSummary, DemoMeta, DemoSummary, MetadataFile } from '../types'
import { loadMetadataFile } from './loader'
import { getLatestVersion, resolveVersion } from './version'

function loadResolvedMetadata(version?: string): MetadataFile {
  const versionKey = resolveVersion(version)
  return loadMetadataFile(versionKey)
}

export function listComponents(version?: string): ComponentMeta[] {
  return loadResolvedMetadata(version).components
}

export function filterComponents(components: ComponentMeta[], keyword?: string): ComponentMeta[] {
  const normalized = keyword?.trim().toLowerCase()
  if (!normalized)
    return components

  return components.filter((component) => {
    const searchable = [
      component.name,
      component.nameZh,
      component.tag,
      component.category,
      component.description,
      component.descriptionZh,
    ]
    return searchable.some(value => value.toLowerCase().includes(normalized))
  })
}

export function toComponentSummary(component: ComponentMeta): ComponentSummary {
  return {
    name: component.name,
    nameZh: component.nameZh,
    tag: component.tag,
    category: component.category,
    description: component.descriptionZh || component.description,
    since: component.since,
  }
}

export function toDemoSummary(demo: DemoMeta): DemoSummary {
  return {
    name: demo.name,
    title: demo.title,
    description: demo.description,
  }
}

export function findComponent(name: string, version?: string): ComponentMeta | undefined {
  const normalized = name.trim().toLowerCase()
  return listComponents(version).find(component => component.name.toLowerCase() === normalized || component.tag.toLowerCase() === normalized)
}

export function getResolvedVersion(version?: string): string {
  if (version)
    return resolveVersion(version)
  return getLatestVersion()
}

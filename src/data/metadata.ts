import type { ComponentMeta, MetadataFile } from '../types'
import { loadMetadataFile } from './loader'
import { getLatestVersion, resolveVersion } from './version'

function loadResolvedMetadata(version?: string): MetadataFile {
  const versionKey = resolveVersion(version)
  return loadMetadataFile(versionKey)
}

export function listComponents(version?: string): ComponentMeta[] {
  return loadResolvedMetadata(version).components
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

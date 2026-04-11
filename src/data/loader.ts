import type { MetadataFile, VersionsFile } from '../types'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const currentDir = dirname(fileURLToPath(import.meta.url))

function resolveDataDir(): string {
  const candidates = [
    join(currentDir, '..', 'data'),
    join(currentDir, '..', '..', 'data'),
    join(currentDir, 'data'),
  ]

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'versions.json')) || existsSync(join(candidate, 'versions.json.gz')))
      return candidate
  }

  throw new Error('Unable to locate bundled data directory')
}

const dataDir = resolveDataDir()

function readJsonFile<T>(baseName: string): T {
  const jsonPath = join(dataDir, `${baseName}.json`)
  if (existsSync(jsonPath))
    return JSON.parse(readFileSync(jsonPath, 'utf8')) as T

  const gzipPath = join(dataDir, `${baseName}.json.gz`)
  if (existsSync(gzipPath)) {
    const compressed = readFileSync(gzipPath)
    return JSON.parse(gunzipSync(compressed).toString('utf8')) as T
  }

  throw new Error(`Data file not found for ${baseName}`)
}

export function loadVersionsFile(): VersionsFile {
  return readJsonFile<VersionsFile>('versions')
}

export function loadMetadataFile(versionKey: string): MetadataFile {
  return readJsonFile<MetadataFile>(versionKey)
}

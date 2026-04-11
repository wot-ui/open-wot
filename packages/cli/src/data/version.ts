import { loadVersionsFile } from './loader'

const VERSION_KEY = 'v2'

export function resolveVersion(requested?: string): string {
  const versions = loadVersionsFile()
  if (!requested)
    return VERSION_KEY

  const normalized = requested.trim()
  const alias = versions.aliases[normalized]
  if (alias)
    return VERSION_KEY

  if (versions.supported.includes(normalized))
    return VERSION_KEY

  if (normalized === VERSION_KEY)
    return VERSION_KEY

  throw new Error(`Unsupported wot-ui version: ${requested}`)
}

export function getLatestVersion(): string {
  return loadVersionsFile().latest
}

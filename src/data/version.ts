import type { VersionInfo } from '../types'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { loadVersionsFile } from './loader'

/** Strip semver range operators (^, ~, >=, >, <=, <, =, whitespace). */
function stripRange(ver: string): string {
  return ver.replace(/[\^~>=<\s]/g, '')
}

/**
 * Returns all stable version strings for major key 'v2',
 * sorted ascending by semver.
 */
function stableV2Versions(): string[] {
  const versions = loadVersionsFile()
  const map = versions.v2 ?? {}
  return Object.values(map)
    .filter(v => !v.includes('-'))
    .sort((a, b) => {
      const pa = a.split('.').map(Number)
      const pb = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (diff !== 0)
          return diff
      }
      return 0
    })
}

/**
 * Auto-detect the wot-ui version to use.
 *
 * Priority:
 *   1. --version flag (flagVersion arg)
 *   2. node_modules/@wot-ui/ui/package.json in cwd
 *   3. package.json dependencies[@wot-ui/ui] in cwd
 *   4. Fallback to latest stable version from versions.json
 */
export function detectVersion(flagVersion?: string, cwd?: string): VersionInfo {
  const dir = cwd ?? process.cwd()

  // 1. Explicit --version flag
  if (flagVersion) {
    return { version: flagVersion, source: 'flag' }
  }

  // 2. node_modules/@wot-ui/ui/package.json
  const nmPath = join(dir, 'node_modules', '@wot-ui', 'ui', 'package.json')
  if (existsSync(nmPath)) {
    try {
      const pkg = JSON.parse(readFileSync(nmPath, 'utf8'))
      if (pkg.version) {
        return { version: pkg.version, source: 'node_modules' }
      }
    }
    catch {
      // ignore parse errors
    }
  }

  // 3. package.json dependency declaration
  const pkgPath = join(dir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      const depVersion
        = pkg.dependencies?.['@wot-ui/ui']
          ?? pkg.devDependencies?.['@wot-ui/ui']
          ?? pkg.peerDependencies?.['@wot-ui/ui']
      if (depVersion) {
        return { version: stripRange(depVersion), source: 'package.json' }
      }
    }
    catch {
      // ignore parse errors
    }
  }

  // 4. Fallback to latest stable from versions.json
  const stable = stableV2Versions()
  const fallback = stable.at(-1) ?? '2.0.0'
  return { version: fallback, source: 'fallback' }
}

/**
 * Resolve a version string (from detectVersion or CLI flag) to a data file key.
 *
 * Examples:
 *   undefined / 'v2'    → 'v2'           (major alias, data/v2.json)
 *   'latest'            → 'v2.0.4'       (latest stable snapshot)
 *   '2.0'               → 'v2.0.4'       (minor → lookup in versions.json)
 *   '2.0.4'             → 'v2.0.4'       (exact patch)
 *   '2.0.0-alpha.5'     → 'v2.0.0-alpha.5' (pre-release exact)
 */
export function resolveVersion(requested?: string): string {
  if (!requested || requested === 'v2')
    return 'v2'

  const normalized = requested.trim()

  if (normalized === 'latest') {
    const stable = stableV2Versions()
    const latest = stable.at(-1)
    if (!latest)
      return 'v2'
    return `v${latest}`
  }

  const versions = loadVersionsFile()
  const map = versions.v2 ?? {}

  // Minor key match: '2.0' → looks up '2.0' in the map
  if (/^\d+\.\d+$/.test(normalized)) {
    const patch = map[normalized]
    if (!patch)
      throw new Error(`Unsupported wot-ui version: ${requested}`)
    return `v${patch}`
  }

  // Patch or pre-release: '2.0.4' or '2.0.0-alpha.5' → 'v2.0.4' / 'v2.0.0-alpha.5'
  // Only v2.x.x is supported.
  if (/^\d+\.\d+\.\d+/.test(normalized)) {
    const major = normalized.split('.')[0]
    if (major !== '2')
      throw new Error(`Unsupported wot-ui version: ${requested}`)
    return `v${normalized}`
  }

  throw new Error(`Unsupported wot-ui version: ${requested}`)
}

export function getLatestVersion(): string {
  const stable = stableV2Versions()
  return stable.at(-1) ?? loadVersionsFile().v2?.['2.0'] ?? '2.0.0'
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { formatUpdateNotice } from './terminal'

const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 1500
const DEFAULT_REGISTRY = 'https://registry.npmjs.org'

interface UpdateCheckCache {
  checkedAt: number
  latestVersion?: string
}

interface FetchResponse {
  ok: boolean
  json: () => Promise<unknown>
}

type FetchLike = (url: string, init?: { headers?: Record<string, string>, signal?: AbortSignal }) => Promise<FetchResponse>

export interface UpdateCheckOptions {
  args?: readonly string[]
  cacheFile?: string
  checkIntervalMs?: number
  currentVersion: string
  env?: NodeJS.ProcessEnv
  fetchFn?: FetchLike
  isTty?: boolean
  now?: number
  packageName: string
  registry?: string
  stderr?: Pick<NodeJS.WriteStream, 'write'>
  timeoutMs?: number
}

export interface CliUpdateStatus {
  cached: boolean
  checkedAt?: number
  command: string
  currentVersion: string
  disabled: boolean
  latestVersion?: string
  packageName: string
  updateAvailable: boolean
}

export function compareSemver(a: string, b: string): number {
  const parsedA = parseSemver(a)
  const parsedB = parseSemver(b)
  if (!parsedA || !parsedB)
    return 0

  for (const index of [0, 1, 2] as const) {
    const diff = parsedA[index] - parsedB[index]
    if (diff !== 0)
      return diff > 0 ? 1 : -1
  }

  return comparePrerelease(parsedA[3], parsedB[3])
}

export function shouldCheckForCliUpdate(args: readonly string[] = process.argv, env: NodeJS.ProcessEnv = process.env, isTty = process.stderr.isTTY): boolean {
  if (!isTty)
    return false
  if (isUpdateCheckDisabled(env) || isTruthyEnv(env.CI) || env.NODE_ENV === 'test')
    return false

  const userArgs = args.slice(2)
  if (userArgs.some(arg => arg === '-V' || arg === '-h' || arg === '--help'))
    return false

  const command = userArgs.find(arg => !arg.startsWith('-'))
  return command !== 'mcp' && command !== 'help'
}

export function checkForCliUpdate(options: UpdateCheckOptions): void {
  const env = options.env ?? process.env
  const args = options.args ?? process.argv
  const stderr = options.stderr ?? process.stderr
  const isTty = options.isTty ?? process.stderr.isTTY

  if (!shouldCheckForCliUpdate(args, env, isTty))
    return

  try {
    const status = getCachedCliUpdateStatus(options)
    if (status.updateAvailable && status.latestVersion) {
      stderr.write(`${formatUpdateNotice(status, { env, isTty })}\n`)
    }
  }
  catch {
    // Update checks must never block or fail a real CLI command.
  }
}

export function getCachedCliUpdateStatus(options: UpdateCheckOptions): CliUpdateStatus {
  const env = options.env ?? process.env
  const baseStatus = createBaseStatus(options, env)
  if (baseStatus.disabled) {
    return {
      ...baseStatus,
      cached: false,
      updateAvailable: false,
    }
  }

  const now = options.now ?? Date.now()
  const cacheFile = options.cacheFile ?? getDefaultCacheFile(env)
  const cached = readCache(cacheFile)
  const intervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
  const cacheIsFresh = !!cached && now - cached.checkedAt < intervalMs
  const latestVersion = cacheIsFresh ? cached.latestVersion : undefined

  return {
    ...baseStatus,
    cached: cacheIsFresh,
    checkedAt: cacheIsFresh ? cached.checkedAt : undefined,
    latestVersion,
    updateAvailable: !!latestVersion && compareSemver(latestVersion, options.currentVersion) > 0,
  }
}

export async function getCliUpdateStatus(options: UpdateCheckOptions): Promise<CliUpdateStatus> {
  const env = options.env ?? process.env
  const baseStatus = createBaseStatus(options, env)
  if (baseStatus.disabled) {
    return {
      ...baseStatus,
      cached: false,
      updateAvailable: false,
    }
  }

  const now = options.now ?? Date.now()
  const cacheFile = options.cacheFile ?? getDefaultCacheFile(env)
  const cached = readCache(cacheFile)
  const intervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
  const cacheIsFresh = !!cached && now - cached.checkedAt < intervalMs
  const result = cacheIsFresh ? cached : await fetchAndCacheLatestVersion(options, cacheFile, now)
  const latestVersion = result.latestVersion

  return {
    ...baseStatus,
    cached: cacheIsFresh,
    checkedAt: result.checkedAt,
    latestVersion,
    updateAvailable: !!latestVersion && compareSemver(latestVersion, options.currentVersion) > 0,
  }
}

function createBaseStatus(options: UpdateCheckOptions, env: NodeJS.ProcessEnv): Omit<CliUpdateStatus, 'cached' | 'checkedAt' | 'latestVersion' | 'updateAvailable'> {
  return {
    command: `npm install -g ${options.packageName}`,
    currentVersion: options.currentVersion,
    disabled: isUpdateCheckDisabled(env),
    packageName: options.packageName,
  }
}

function parseSemver(version: string): [number, number, number, string | undefined] | undefined {
  const match = version.trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.*)?$/)
  if (!match)
    return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4]]
}

function comparePrerelease(a: string | undefined, b: string | undefined): number {
  if (!a && !b)
    return 0
  if (!a)
    return 1
  if (!b)
    return -1

  const identifiersA = a.split('.')
  const identifiersB = b.split('.')
  const length = Math.max(identifiersA.length, identifiersB.length)
  for (let index = 0; index < length; index++) {
    const identifierA = identifiersA[index]
    const identifierB = identifiersB[index]
    if (identifierA === undefined)
      return -1
    if (identifierB === undefined)
      return 1
    if (identifierA === identifierB)
      continue

    const numberA = parseNumericIdentifier(identifierA)
    const numberB = parseNumericIdentifier(identifierB)
    if (numberA !== undefined && numberB !== undefined)
      return numberA > numberB ? 1 : -1
    if (numberA !== undefined)
      return -1
    if (numberB !== undefined)
      return 1

    return identifierA > identifierB ? 1 : -1
  }

  return 0
}

function parseNumericIdentifier(identifier: string): number | undefined {
  if (!/^(?:0|[1-9]\d*)$/.test(identifier))
    return undefined
  return Number(identifier)
}

function isTruthyEnv(value: string | undefined): boolean {
  return !!value && value !== '0' && value !== 'false'
}

function isUpdateCheckDisabled(env: NodeJS.ProcessEnv): boolean {
  return isTruthyEnv(env.WOT_DISABLE_UPDATE_CHECK) || isTruthyEnv(env.NO_UPDATE_NOTIFIER)
}

function getDefaultCacheFile(env: NodeJS.ProcessEnv): string {
  const baseDir = env.XDG_CACHE_HOME
    ? join(env.XDG_CACHE_HOME, 'open-wot')
    : join(homedir(), '.cache', 'open-wot')
  return join(baseDir, 'update-check.json')
}

function readCache(cacheFile: string): UpdateCheckCache | undefined {
  if (!existsSync(cacheFile))
    return undefined

  let cache: Partial<UpdateCheckCache> | null
  try {
    cache = JSON.parse(readFileSync(cacheFile, 'utf8')) as Partial<UpdateCheckCache> | null
  }
  catch {
    return undefined
  }
  if (!cache || typeof cache !== 'object' || typeof cache.checkedAt !== 'number')
    return undefined

  return {
    checkedAt: cache.checkedAt,
    latestVersion: typeof cache.latestVersion === 'string' ? cache.latestVersion : undefined,
  }
}

async function fetchAndCacheLatestVersion(options: UpdateCheckOptions, cacheFile: string, now: number): Promise<UpdateCheckCache> {
  let latestVersion: string | undefined
  try {
    latestVersion = await fetchLatestVersion(
      options.packageName,
      options.registry ?? options.env?.npm_config_registry ?? DEFAULT_REGISTRY,
      options.fetchFn,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
  }
  catch {
    latestVersion = undefined
  }

  const cache = {
    checkedAt: now,
    latestVersion,
  }
  writeCache(cacheFile, cache)

  return cache
}

async function fetchLatestVersion(packageName: string, registry: string, fetchFn: FetchLike | undefined, timeoutMs: number): Promise<string | undefined> {
  const request = fetchFn ?? globalThis.fetch
  if (typeof request !== 'function')
    return undefined

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await request(`${registry.replace(/\/+$/, '')}/${encodePackageName(packageName)}/latest`, {
      headers: {
        'accept': 'application/json',
        'user-agent': `${packageName} update-check`,
      },
      signal: controller.signal,
    })
    if (!response.ok)
      return undefined

    const json = await response.json()
    if (isRegistryLatestResponse(json))
      return json.version
  }
  finally {
    clearTimeout(timeout)
  }

  return undefined
}

function encodePackageName(packageName: string): string {
  if (!packageName.startsWith('@'))
    return encodeURIComponent(packageName)

  const [scope, name] = packageName.split('/')
  return `${scope}%2f${name}`
}

function isRegistryLatestResponse(value: unknown): value is { version: string } {
  return typeof value === 'object' && value !== null && 'version' in value && typeof value.version === 'string'
}

function writeCache(cacheFile: string, cache: UpdateCheckCache): void {
  try {
    mkdirSync(dirname(cacheFile), { recursive: true })
    writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`)
  }
  catch {
    // Cache writes are best-effort and must not break CLI or MCP calls.
  }
}

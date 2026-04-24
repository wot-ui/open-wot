#!/usr/bin/env node

/**
 * Sync wot-ui metadata across all available v2.x.x tags.
 *
 * For each minor series (X.Y):
 *   1. Fetches all release tags from the wot-ui GitHub repo via git ls-remote
 *   2. Extracts per-minor snapshots (e.g. data/v2.0.4.json) for new minor series
 *   3. Extracts the latest stable snapshot as data/v2.json
 *   4. Keeps data/versions.json up to date via extract.ts
 *
 * Usage:
 *   tsx scripts/sync.ts --wot-dir <path-to-wot-design-uni>
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const WOT_REMOTE = 'https://github.com/wot-ui/wot-ui.git'
const EXTRACT_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'extract.ts')

function parseArgs(argv: string[]): { wotDir: string } {
  let wotDir = ''
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--wot-dir' && argv[i + 1]) {
      wotDir = argv[++i]
    }
  }
  if (!wotDir) {
    console.error('Usage: tsx scripts/sync.ts --wot-dir <path-to-wot-design-uni>')
    process.exit(1)
  }
  return { wotDir }
}

/** Fetch all v2.x.x tags from the remote, sorted ascending by semver. */
function fetchTags(): string[] {
  const out = execSync(
    `git ls-remote --tags --sort=v:refname ${WOT_REMOTE} "refs/tags/v2.*"`,
    { encoding: 'utf8' },
  )
  return out
    .split('\n')
    .filter(line => line && !line.includes('^{}'))
    .map(line => line.replace(/.*refs\/tags\//, ''))
    // strip tag refs like v2.0.0-alpha.5^{} that slipped through
    .filter(tag => tag.length > 0)
}

/**
 * For each minor series (X.Y), pick the highest stable patch tag.
 * Pre-releases (tags containing '-') are excluded.
 * Returns a Map of minorKey ('2.0') → full tag ('v2.0.4')
 */
function buildMinorMap(tags: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const tag of tags) {
    const ver = tag.startsWith('v') ? tag.slice(1) : tag
    if (ver.includes('-'))
      continue // skip pre-releases
    const parts = ver.split('.')
    if (parts.length < 3)
      continue
    const [major, minor, patch] = parts
    const minorKey = `${major}.${minor}`
    const cur = map.get(minorKey)
    if (!cur || Number(patch) > Number((cur.startsWith('v') ? cur.slice(1) : cur).split('.')[2])) {
      map.set(minorKey, tag)
    }
  }
  return map
}

function checkout(wotDir: string, tag: string): void {
  process.stdout.write(`  git checkout ${tag}\n`)
  execSync(`git checkout ${tag}`, { cwd: wotDir, stdio: 'pipe' })
}

function extract(wotDir: string, output: string): void {
  execSync(`npx tsx ${EXTRACT_SCRIPT} --wot-dir ${wotDir} --output ${output}`, {
    stdio: 'inherit',
  })
}

function main(): void {
  const { wotDir } = parseArgs(process.argv.slice(2))

  process.stdout.write('\n=== Syncing wot-ui v2 ===\n')
  process.stdout.write(`  source: ${wotDir}\n`)

  const tags = fetchTags()
  const minorMap = buildMinorMap(tags)

  if (minorMap.size === 0) {
    process.stderr.write('  No stable v2.x.x tags found, aborting\n')
    process.exit(1)
  }

  // Latest stable tag is the last entry in the sorted minor map
  const latestTag = [...minorMap.values()].at(-1)!
  process.stdout.write(`  latest stable tag: ${latestTag}\n`)

  // Extract primary snapshot → data/v2.json (skip if already up-to-date)
  const primaryFile = 'data/v2.json'
  const currentVersion = existsSync(primaryFile)
    ? JSON.parse(readFileSync(primaryFile, 'utf8')).version
    : null
  const latestVer = latestTag.startsWith('v') ? latestTag.slice(1) : latestTag
  if (currentVersion === latestVer) {
    process.stdout.write(`  v2 already at ${latestVer}, skipping primary extract\n`)
  }
  else {
    process.stdout.write(`  v2: ${currentVersion ?? '(none)'} → ${latestVer}\n`)
    checkout(wotDir, latestTag)
    extract(wotDir, primaryFile)
  }

  // Extract a snapshot for every stable patch tag (e.g. v2.0.0, v2.0.1, …).
  // Pre-release tags are skipped. Already-existing snapshots are skipped.
  const stableTags = tags.filter((tag) => {
    const ver = tag.startsWith('v') ? tag.slice(1) : tag
    return !ver.includes('-') && ver.split('.').length >= 3
  })
  for (const tag of stableTags) {
    const ver = tag.startsWith('v') ? tag.slice(1) : tag
    const snapshot = `data/v${ver}.json`
    if (existsSync(snapshot)) {
      process.stdout.write(`  Snapshot ${snapshot} already exists, skipping\n`)
      continue
    }
    process.stdout.write(`  Extracting ${tag}\n`)
    checkout(wotDir, tag)
    extract(wotDir, snapshot)
  }

  process.stdout.write('\nSync complete.\n')
}

main()

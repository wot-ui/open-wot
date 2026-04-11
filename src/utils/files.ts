import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DEFAULT_IGNORES = new Set([
  '.git',
  '.idea',
  '.output',
  '.turbo',
  '.vscode',
  'dist',
  'build',
  'coverage',
  'node_modules',
])

export function walkFiles(rootDir: string, extensions: string[]): string[] {
  const results: string[] = []

  function visit(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (DEFAULT_IGNORES.has(entry.name))
        continue

      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(fullPath)
        continue
      }

      if (extensions.some(extension => entry.name.endsWith(extension)))
        results.push(fullPath)
    }
  }

  visit(rootDir)
  return results
}

export function safeRelative(rootDir: string, filePath: string): string {
  return relative(rootDir, filePath) || '.'
}

export function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  }
  catch {
    return false
  }
}

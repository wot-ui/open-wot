import type { LintIssue, LintReport, UsageEntry, UsageReport } from '../types'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@vue/compiler-sfc'
import { findComponent, listComponents } from '../data/metadata'
import { safeRelative, walkFiles } from './files'

const IMPORT_RE = /from\s+['"]([^'"]*wot[^'"]*)['"]/g
const TAG_RE = /<\s*(wd-[a-z0-9-]+)/gi
const BUTTON_RE = /<wd-button\b([^>]*)>([\s\S]*?)<\/wd-button>|<wd-button\b([^>]*)\/>/gi

function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function collectTemplateTags(content: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const match of content.matchAll(TAG_RE)) {
    const tag = match[1]?.toLowerCase()
    if (!tag)
      continue
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return counts
}

function collectImports(scriptContent: string): string[] {
  const imports = new Set<string>()
  for (const match of scriptContent.matchAll(IMPORT_RE)) {
    if (match[1])
      imports.add(match[1])
  }
  return [...imports]
}

export function analyzeUsage(targetDir: string, version?: string): UsageReport {
  const dir = resolve(targetDir)
  const files = walkFiles(dir, ['.vue'])
  const knownByTag = new Map(listComponents(version).map(component => [component.tag.toLowerCase(), component]))
  const usageMap = new Map<string, UsageEntry>()
  const imports = new Set<string>()

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const parsed = parse(source, { filename: file })
    const template = parsed.descriptor.template?.content ?? ''
    const script = [parsed.descriptor.script?.content ?? '', parsed.descriptor.scriptSetup?.content ?? ''].filter(Boolean).join('\n')

    for (const item of collectImports(script))
      imports.add(item)

    for (const [tag, count] of collectTemplateTags(template)) {
      const known = knownByTag.get(tag)
      const key = known?.name ?? tag
      const existing = usageMap.get(key)
      if (existing) {
        existing.count += count
        if (!existing.files.includes(safeRelative(dir, file)))
          existing.files.push(safeRelative(dir, file))
        continue
      }

      usageMap.set(key, {
        name: known?.name ?? tag,
        tag,
        count,
        files: [safeRelative(dir, file)],
      })
    }
  }

  return {
    scannedFiles: files.length,
    components: [...usageMap.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    imports: [...imports].sort(),
  }
}

export function lintProject(targetDir: string, version?: string): LintReport {
  const dir = resolve(targetDir)
  const files = walkFiles(dir, ['.vue'])
  const issues: LintIssue[] = []

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const parsed = parse(source, { filename: file })
    const template = parsed.descriptor.template?.content ?? ''

    for (const match of template.matchAll(TAG_RE)) {
      const tag = match[1]?.toLowerCase()
      if (!tag)
        continue
      if (!findComponent(tag, version)) {
        issues.push({
          file: safeRelative(dir, file),
          line: getLineNumber(template, match.index ?? 0),
          rule: 'unknown-component',
          severity: 'warning',
          message: `Unknown wot-ui component tag: ${tag}`,
        })
      }
    }

    for (const match of template.matchAll(BUTTON_RE)) {
      const attrs = (match[1] ?? match[3] ?? '').trim()
      const body = (match[2] ?? '').replace(/<[^>]+>/g, '').trim()
      const icon = /\bicon\s*=/.test(attrs)
      if (!icon && !body) {
        issues.push({
          file: safeRelative(dir, file),
          line: getLineNumber(template, match.index ?? 0),
          rule: 'button-content',
          severity: 'warning',
          message: 'wd-button should include visible text content or an icon attribute.',
        })
      }

      const component = findComponent('wd-button', version)
      for (const prop of component?.props ?? []) {
        if (!prop.deprecated)
          continue
        const propRe = new RegExp(`\\b${prop.name}\\b`)
        if (!propRe.test(attrs))
          continue
        issues.push({
          file: safeRelative(dir, file),
          line: getLineNumber(template, match.index ?? 0),
          rule: 'deprecated-prop',
          severity: 'warning',
          message: prop.replacement
            ? `Deprecated prop ${prop.name} detected on wd-button. Use ${prop.replacement} instead.`
            : `Deprecated prop ${prop.name} detected on wd-button.`,
        })
      }
    }
  }

  return {
    scannedFiles: files.length,
    issues,
  }
}

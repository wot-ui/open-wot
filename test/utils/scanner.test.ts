import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findComponent, listComponents } from '../../src/data/metadata'
import { analyzeUsage, lintProject } from '../../src/utils/scanner'

vi.mock('../../src/data/metadata', () => ({
  listComponents: vi.fn(),
  findComponent: vi.fn(),
}))

const tempDirs: string[] = []

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir)
      rmSync(dir, { recursive: true, force: true })
  }
})

describe('utils/scanner', () => {
  beforeEach(() => {
    vi.mocked(listComponents).mockReturnValue([
      { name: 'Button', tag: 'wd-button' },
      { name: 'Cell', tag: 'wd-cell' },
    ] as any)

    vi.mocked(findComponent).mockImplementation((name) => {
      const lower = String(name).toLowerCase()
      if (lower === 'wd-button' || lower === 'button') {
        return {
          name: 'Button',
          props: [{ name: 'old-type', deprecated: true, replacement: 'type' }],
        } as any
      }
      if (lower === 'wd-cell' || lower === 'cell')
        return { name: 'Cell', props: [] } as any
      return undefined
    })
  })

  it('analyzes component usage and imports from vue files', () => {
    const dir = createTempDir('open-wot-scanner-usage-')
    writeFileSync(join(dir, 'page.vue'), `
<template>
  <wd-button />
  <wd-button />
  <wd-cell />
</template>
<script setup lang="ts">
import { useToast } from '@wot-ui/ui'
</script>
`)

    const report = analyzeUsage(dir)
    const button = report.components.find(item => item.tag === 'wd-button')

    expect(report.scannedFiles).toBe(1)
    expect(button?.count).toBe(2)
    expect(report.imports).toContain('@wot-ui/ui')
  })

  it('lints unknown tags, empty button content and deprecated props', () => {
    const dir = createTempDir('open-wot-scanner-lint-')
    writeFileSync(join(dir, 'lint.vue'), `
<template>
  <wd-unknown />
  <wd-button old-type />
  <wd-button />
</template>
`)

    const report = lintProject(dir)
    const rules = report.issues.map(issue => issue.rule)

    expect(report.scannedFiles).toBe(1)
    expect(rules).toContain('unknown-component')
    expect(rules).toContain('deprecated-prop')
    expect(rules).toContain('button-content')
  })
})

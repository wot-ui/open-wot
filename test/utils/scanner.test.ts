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

const compoundComponentCases = [
  { name: 'Tab', parentTag: 'wd-tabs', childTag: 'wd-tab' },
  { name: 'Grid', parentTag: 'wd-grid', childTag: 'wd-grid-item' },
  { name: 'Tabbar', parentTag: 'wd-tabbar', childTag: 'wd-tabbar-item' },
] as const

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
      { name: 'Tab', tag: 'wd-tabs' },
      { name: 'Grid', tag: 'wd-grid' },
      { name: 'Tabbar', tag: 'wd-tabbar' },
      { name: 'Layout', tag: 'wd-layout' },
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

  it.each(compoundComponentCases)('attributes $childTag to its parent metadata while preserving the actual tag', ({ name, parentTag, childTag }) => {
    const dir = createTempDir('open-wot-scanner-compound-usage-')
    writeFileSync(join(dir, 'compound.vue'), `
<template>
  <${parentTag}>
    <${childTag} />
    <${childTag} />
  </${parentTag}>
</template>
`)

    const report = analyzeUsage(dir, '2.1.0')
    const parent = report.components.find(item => item.tag === parentTag)
    const child = report.components.find(item => item.tag === childTag)

    expect(parent).toMatchObject({ name, tag: parentTag, count: 1 })
    expect(child).toMatchObject({ name, tag: childTag, count: 2 })
    expect(listComponents).toHaveBeenCalledWith('2.1.0')
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

  it.each(compoundComponentCases)('accepts $childTag, reports real unknown tags, and forwards the version', ({ parentTag, childTag }) => {
    const dir = createTempDir('open-wot-scanner-compound-lint-')
    writeFileSync(join(dir, 'lint.vue'), `
<template>
  <${parentTag}>
    <${childTag} />
  </${parentTag}>
  <wd-does-not-exist />
</template>
`)

    const report = lintProject(dir, '2.1.0')

    expect(report.issues).toEqual([
      expect.objectContaining({
        rule: 'unknown-component',
        message: 'Unknown wot-ui component tag: wd-does-not-exist',
      }),
    ])
    expect(listComponents).toHaveBeenCalledWith('2.1.0')
  })

  it('recognizes compound tags whose primary metadata tag differs from their rendered tags', () => {
    const dir = createTempDir('open-wot-scanner-layout-lint-')
    writeFileSync(join(dir, 'layout.vue'), `
<template>
  <wd-row>
    <wd-col :span="12" />
  </wd-row>
</template>
`)

    expect(lintProject(dir, '2.1.0').issues).toEqual([])
  })
})

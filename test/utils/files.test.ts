import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { directoryExists, safeRelative, walkFiles } from '../../src/utils/files'

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

describe('utils/files', () => {
  it('walkFiles filters by extension and ignores known folders', () => {
    const root = createTempDir('open-wot-files-')
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'coverage'), { recursive: true })
    mkdirSync(join(root, 'node_modules/pkg'), { recursive: true })

    writeFileSync(join(root, 'src', 'a.vue'), '<template/>')
    writeFileSync(join(root, 'src', 'b.ts'), 'export {}')
    writeFileSync(join(root, 'coverage', 'skip.vue'), '<template/>')
    writeFileSync(join(root, 'node_modules', 'pkg', 'skip.vue'), '<template/>')

    const files = walkFiles(root, ['.vue']).sort()

    expect(files).toEqual([join(root, 'src', 'a.vue')])
  })

  it('safeRelative returns dot for root path', () => {
    const root = createTempDir('open-wot-relative-')
    expect(safeRelative(root, root)).toBe('.')
  })

  it('detects directory existence safely', () => {
    const root = createTempDir('open-wot-dir-')
    expect(directoryExists(root)).toBe(true)
    expect(directoryExists(join(root, 'missing'))).toBe(false)
  })
})

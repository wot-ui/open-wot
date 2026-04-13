/*
 * @Author: weisheng
 * @Date: 2026-04-13 15:45:41
 * @LastEditTime: 2026-04-13 15:51:44
 * @LastEditors: weisheng
 * @Description:
 * @FilePath: /open-wot/test/utils/project.test.ts
 * 记得注释
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { diagnoseProject } from '../../src/utils/project'

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

describe('utils/project diagnoseProject', () => {
  it('returns fail check when package.json is missing', () => {
    const dir = createTempDir('open-wot-project-empty-')
    const report = diagnoseProject(dir)

    expect(report.checks[0]?.name).toBe('package-json')
    expect(report.checks[0]?.status).toBe('fail')
  })

  it('detects dependency checks and node_modules status', () => {
    const dir = createTempDir('open-wot-project-full-')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: {
        'vue': '^3.4.0',
        '@wot-ui/ui': '^2.0.0',
        '@dcloudio/uni-app': '^3.0.0',
      },
      devDependencies: {
        typescript: '^5.0.0',
      },
    }))

    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    expect(existsSync(join(dir, 'node_modules'))).toBe(true)

    const report = diagnoseProject(dir)
    const byName = new Map(report.checks.map(check => [check.name, check]))

    expect(byName.get('package-json')?.status).toBe('pass')
    expect(byName.get('wot-ui-installed')?.status).toBe('pass')
    expect(byName.get('vue-version')?.status).toBe('pass')
    expect(byName.get('uni-app-version')?.status).toBe('pass')
    expect(byName.get('typescript')?.status).toBe('pass')
    expect(byName.get('node-modules')?.status).toBe('pass')
  })

  it('returns warn checks for missing optional dependencies', () => {
    const dir = createTempDir('open-wot-project-warn-')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: {
        vue: '^2.7.0',
      },
    }))

    const report = diagnoseProject(dir)
    const byName = new Map(report.checks.map(check => [check.name, check]))

    expect(byName.get('wot-ui-installed')?.status).toBe('fail')
    expect(byName.get('vue-version')?.status).toBe('warn')
    expect(byName.get('uni-app-version')?.status).toBe('warn')
    expect(byName.get('typescript')?.status).toBe('warn')
    expect(byName.get('node-modules')?.status).toBe('warn')
  })

  it('does not treat @wot-ui/router as wot-ui component dependency', () => {
    const dir = createTempDir('open-wot-project-router-only-')
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: {
        '@wot-ui/router': '^1.1.2',
        'vue': '^3.4.0',
      },
    }))

    const report = diagnoseProject(dir)
    const byName = new Map(report.checks.map(check => [check.name, check]))

    expect(byName.get('wot-ui-installed')?.status).toBe('fail')
  })
})

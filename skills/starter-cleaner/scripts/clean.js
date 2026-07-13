/* eslint-disable no-console -- CLI script intentionally reports its cleanup plan and progress. */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const dryRun = process.argv.includes('--dry-run')
const force = process.argv.includes('--force')

const pathsToRemove = [
  'docs',
  'src/subPages',
  'src/subEcharts',
  'src/subAsyncEcharts',
  'src/pages.json',
  'pnpm-workspace.yaml',
]

const subPackagePaths = [
  'src/subPages',
  'src/subEcharts',
  'src/subAsyncEcharts',
]

function findProjectRoot(directory) {
  const packageJsonPath = path.join(directory, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    return directory
  }

  const parentDirectory = path.dirname(directory)
  if (parentDirectory === directory) {
    throw new Error('找不到项目根目录（未发现 package.json）')
  }

  return findProjectRoot(parentDirectory)
}

function readPackageJson(packageJsonPath) {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
}

function assertWotStarterV2(packageJson) {
  const isWotStarter = packageJson.name === 'wot-starter'
  const isV2 = String(packageJson.version ?? '').startsWith('2.')

  if (!force && (!isWotStarter || !isV2)) {
    throw new Error(
      `目标项目不是 wot-starter v2（name=${packageJson.name ?? 'unknown'}, version=${packageJson.version ?? 'unknown'}）。确认目标无误后可使用 --force。`,
    )
  }
}

function removePath(projectRoot, relativePath) {
  const targetPath = path.join(projectRoot, relativePath)

  if (!fs.existsSync(targetPath)) {
    console.log(`跳过（不存在）：${relativePath}`)
    return false
  }

  console.log(`${dryRun ? '计划删除' : '删除'}：${relativePath}`)
  if (!dryRun) {
    fs.rmSync(targetPath, { recursive: true, force: true })
  }
  return true
}

function updateTextFile(filePath, transform) {
  if (!fs.existsSync(filePath)) {
    console.log(`跳过（不存在）：${path.basename(filePath)}`)
    return false
  }

  const originalContent = fs.readFileSync(filePath, 'utf8')
  const nextContent = transform(originalContent)
  if (nextContent === originalContent) {
    console.log(`跳过（无需修改）：${path.basename(filePath)}`)
    return false
  }

  console.log(`${dryRun ? '计划修改' : '修改'}：${path.basename(filePath)}`)
  if (!dryRun) {
    fs.writeFileSync(filePath, nextContent, 'utf8')
  }
  return true
}

function cleanViteConfig(projectRoot) {
  const viteConfigPath = path.join(projectRoot, 'vite.config.ts')

  updateTextFile(viteConfigPath, (content) => {
    const lines = content.split('\n').filter((line) => {
      return !subPackagePaths.some((subPackagePath) => {
        return line.includes(`'${subPackagePath}'`) || line.includes(`"${subPackagePath}"`)
      })
    })

    return lines.join('\n').replace(/subPackages:\s*\[\s*\],/g, 'subPackages: [],')
  })
}

function cleanPackageJson(projectRoot, packageJson) {
  const scriptNames = Object.keys(packageJson.scripts ?? {})
  const scriptsToRemove = scriptNames.filter(name => name.startsWith('docs:') || name === 'lint:docs')

  if (scriptsToRemove.length === 0) {
    console.log('跳过（无需修改）：package.json')
    return
  }

  for (const scriptName of scriptsToRemove) {
    delete packageJson.scripts[scriptName]
  }

  console.log(`${dryRun ? '计划修改' : '修改'}：package.json（移除 ${scriptsToRemove.join(', ')}）`)
  if (!dryRun) {
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      `${JSON.stringify(packageJson, null, 2)}\n`,
      'utf8',
    )
  }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function isGeneratedPagesReady(projectRoot) {
  const pagesJsonPath = path.join(projectRoot, 'src/pages.json')

  if (!fs.existsSync(pagesJsonPath)) {
    return false
  }

  const content = fs.readFileSync(pagesJsonPath, 'utf8')
  return content.includes('"pages"') && !subPackagePaths.some(subPackagePath => content.includes(subPackagePath))
}

function stopProcess(childProcess) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return
  }

  if (process.platform === 'win32') {
    childProcess.kill('SIGTERM')
    return
  }

  try {
    process.kill(-childProcess.pid, 'SIGTERM')
  }
  catch {
    childProcess.kill('SIGTERM')
  }
}

async function regeneratePagesJson(projectRoot) {
  console.log('生成：src/pages.json（pnpm dev:h5）')

  const childProcess = spawn('pnpm', ['dev:h5'], {
    cwd: projectRoot,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      BROWSER: 'none',
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  childProcess.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  childProcess.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  const timeoutAt = Date.now() + 30000
  try {
    while (Date.now() < timeoutAt) {
      if (isGeneratedPagesReady(projectRoot)) {
        console.log('已生成：src/pages.json')
        return
      }

      if (childProcess.exitCode !== null) {
        break
      }

      await sleep(250)
    }

    throw new Error(`未能通过 pnpm dev:h5 生成 src/pages.json。\n${output.trim()}`)
  }
  finally {
    stopProcess(childProcess)
  }
}

async function main() {
  const projectRoot = findProjectRoot(scriptDirectory)
  const packageJsonPath = path.join(projectRoot, 'package.json')
  const packageJson = readPackageJson(packageJsonPath)

  assertWotStarterV2(packageJson)
  console.log(`${dryRun ? '预览清理' : '开始清理'}：${projectRoot}`)

  for (const relativePath of pathsToRemove) {
    removePath(projectRoot, relativePath)
  }

  cleanViteConfig(projectRoot)
  cleanPackageJson(projectRoot, packageJson)

  if (!dryRun) {
    await regeneratePagesJson(projectRoot)
  }

  console.log(dryRun ? '预览完成，未修改任何文件。' : '清理完成。请运行 pnpm install --lockfile-only 更新锁文件。')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})

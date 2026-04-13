import type { DoctorCheck, DoctorReport } from '../types'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface PackageJsonLike {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function readPackageJson(dir: string): PackageJsonLike | undefined {
  const packageJsonPath = join(dir, 'package.json')
  if (!existsSync(packageJsonPath))
    return undefined
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJsonLike
}

function getDependencyVersion(pkg: PackageJsonLike | undefined, name: string): string | undefined {
  return pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name]
}

function detectWotDependency(pkg: PackageJsonLike | undefined): string | undefined {
  const version = getDependencyVersion(pkg, '@wot-ui/ui')
  return version ? `@wot-ui/ui@${version}` : undefined
}

function createCheck(name: string, status: DoctorCheck['status'], message: string, suggestion?: string): DoctorCheck {
  if (status === 'pass')
    return { name, status, message }
  return { name, status, severity: status === 'fail' ? 'error' : 'warning', message, suggestion }
}

export function diagnoseProject(targetDir: string): DoctorReport {
  const dir = resolve(targetDir)
  const pkg = readPackageJson(dir)
  const checks: DoctorCheck[] = []

  if (!pkg) {
    checks.push(createCheck('package-json', 'fail', 'No package.json found in target directory.', 'Run the command in a project root or pass a directory containing package.json.'))
    return { dir, checks }
  }

  checks.push(createCheck('package-json', 'pass', 'package.json found.'))

  const wotVersion = detectWotDependency(pkg)
  if (wotVersion)
    checks.push(createCheck('wot-ui-installed', 'pass', `Detected ${wotVersion}.`))
  else
    checks.push(createCheck('wot-ui-installed', 'fail', 'No @wot-ui/ui dependency detected.', 'Add @wot-ui/ui to dependencies before using doctor, usage, and lint.'))

  const vueVersion = getDependencyVersion(pkg, 'vue')
  if (vueVersion)
    checks.push(createCheck('vue-version', vueVersion.includes('3') ? 'pass' : 'warn', `Detected vue ${vueVersion}.`, vueVersion.includes('3') ? undefined : 'wot-ui v2 is designed for Vue 3 based projects.'))
  else
    checks.push(createCheck('vue-version', 'warn', 'Vue dependency not found.', 'Add vue@3 to align with wot-ui v2 expectations.'))

  const uniAppVersion = getDependencyVersion(pkg, '@dcloudio/uni-app') ?? getDependencyVersion(pkg, 'uni-app')
  if (uniAppVersion)
    checks.push(createCheck('uni-app-version', 'pass', `Detected uni-app ${uniAppVersion}.`))
  else
    checks.push(createCheck('uni-app-version', 'warn', 'uni-app dependency not found.', 'If this is a uni-app project, add @dcloudio/uni-app.'))

  const typescriptVersion = getDependencyVersion(pkg, 'typescript')
  if (typescriptVersion)
    checks.push(createCheck('typescript', 'pass', `Detected typescript ${typescriptVersion}.`))
  else
    checks.push(createCheck('typescript', 'warn', 'TypeScript dependency not found.', 'Add TypeScript if you want type-safe wot-ui development and CLI analysis.'))

  const hasNodeModules = existsSync(join(dir, 'node_modules'))
  checks.push(createCheck('node-modules', hasNodeModules ? 'pass' : 'warn', hasNodeModules ? 'node_modules directory found.' : 'node_modules directory not found.', hasNodeModules ? undefined : 'Run your package manager install command before deeper diagnostics.'))

  return { dir, checks }
}

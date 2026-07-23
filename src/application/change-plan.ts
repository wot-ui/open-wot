import type { ApplyResult, ChangePlan, PlannedFileChange, PublicChangePlan } from '../mcp/clients/types'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, chmod, copyFile, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative } from 'node:path'
import process from 'node:process'
import { createInterface } from 'node:readline/promises'

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  }
  catch {
    return false
  }
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return undefined
    throw error
  }
}

export interface RollbackFailure {
  path: string
  error: string
  backupPath?: string
}

export interface CleanupFailure {
  path: string
  error: string
}

export class ChangePlanCleanupError extends Error {
  readonly applied: string[]
  readonly cleanupFailures: CleanupFailure[]

  constructor(options: { applied: string[], cleanupFailures: CleanupFailure[] }) {
    super(`Change plan was applied, but transaction cleanup failed for ${options.cleanupFailures.map(failure => failure.path).join(', ')}`)
    this.name = 'ChangePlanCleanupError'
    this.applied = options.applied
    this.cleanupFailures = options.cleanupFailures
  }
}

export class ChangePlanApplyError extends Error {
  readonly cause: unknown
  readonly applied: string[]
  readonly rolledBack: string[]
  readonly rollbackFailures: RollbackFailure[]
  readonly cleanupFailures: CleanupFailure[]

  constructor(options: { cause: unknown, applied: string[], rolledBack: string[], rollbackFailures: RollbackFailure[], cleanupFailures: CleanupFailure[] }) {
    const causeMessage = options.cause instanceof Error ? options.cause.message : String(options.cause)
    const rollbackMessage = options.rollbackFailures.length > 0
      ? `rollback incomplete for ${options.rollbackFailures.map(failure => failure.backupPath ? `${failure.path} (backup: ${failure.backupPath})` : failure.path).join(', ')}`
      : options.applied.length > 0
        ? `rolled back ${options.rolledBack.length} applied change${options.rolledBack.length === 1 ? '' : 's'}`
        : 'no files were changed'
    const cleanupMessage = options.cleanupFailures.length > 0
      ? `; cleanup incomplete for ${options.cleanupFailures.map(failure => failure.path).join(', ')}`
      : ''
    super(`Failed to apply change plan; ${rollbackMessage}${cleanupMessage}: ${causeMessage}`)
    this.name = 'ChangePlanApplyError'
    this.cause = options.cause
    this.applied = options.applied
    this.rolledBack = options.rolledBack
    this.rollbackFailures = options.rollbackFailures
    this.cleanupFailures = options.cleanupFailures
  }
}

export interface ChangePlanApplyHooks {
  beforeCommit?: (change: PlannedFileChange, index: number) => Promise<void> | void
  beforeBackup?: (change: PlannedFileChange, backupPath: string, index: number) => Promise<void> | void
  beforeRollback?: (change: PlannedFileChange, index: number) => Promise<void> | void
  beforeCleanup?: (path: string) => Promise<void> | void
}

function isWithinRoot(root: string, path: string): boolean {
  const relation = relative(root, path)
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

async function nearestExistingPath(path: string): Promise<string> {
  let current = path
  while (true) {
    try {
      await lstat(current)
      return current
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
      const parent = dirname(current)
      if (parent === current)
        throw error
      current = parent
    }
  }
}

async function assertPlanPath(change: PlannedFileChange): Promise<void> {
  const { path, allowedRoot } = change
  if (!path || path === '/' || path === process.env.HOME)
    throw new Error(`Refusing unsafe change target: ${path || '<empty>'}`)
  if (!allowedRoot)
    throw new Error(`Missing allowed root for change target: ${path}`)

  const [resolvedRoot, existingPath] = await Promise.all([
    realpath(allowedRoot),
    nearestExistingPath(path),
  ])
  const resolvedExistingPath = await realpath(existingPath)
  if (!isWithinRoot(resolvedRoot, resolvedExistingPath))
    throw new Error(`Refusing change target outside allowed root: ${path}`)

  if (existingPath === path && (await lstat(path)).isSymbolicLink())
    throw new Error(`Refusing symbolic link change target: ${path}`)
}

async function assertUnchanged(change: PlannedFileChange): Promise<void> {
  await assertPlanPath(change)
  const actual = await readOptionalFile(change.path)
  if (actual !== change.before)
    throw new Error(`Target changed after planning: ${change.path}`)
}

interface PreparedChange {
  change: PlannedFileChange
  temporaryPath?: string
  backupPath?: string
  touched: boolean
  backupCreated: boolean
}

function transactionPath(path: string, transactionId: string, index: number, suffix: 'tmp' | 'rollback'): string {
  return `${path}.open-wot-${transactionId}-${index}.${suffix}`
}

async function prepareChange(change: PlannedFileChange, transactionId: string, index: number): Promise<PreparedChange> {
  await assertPlanPath(change)
  if (change.type === 'delete-file')
    return { change, touched: false, backupCreated: false }

  await mkdir(dirname(change.path), { recursive: true })
  const temporaryPath = transactionPath(change.path, transactionId, index, 'tmp')
  try {
    await writeFile(temporaryPath, change.after ?? '', 'utf8')
    if (change.before !== undefined && await pathExists(change.path))
      await chmod(temporaryPath, (await stat(change.path)).mode)
    return { change, temporaryPath, touched: false, backupCreated: false }
  }
  catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

async function commitChange(prepared: PreparedChange, transactionId: string, index: number, hooks: ChangePlanApplyHooks): Promise<void> {
  const { change } = prepared
  await assertUnchanged(change)
  if (change.before !== undefined) {
    prepared.backupPath = transactionPath(change.path, transactionId, index, 'rollback')
    await hooks.beforeBackup?.(change, prepared.backupPath, index)
    await copyFile(change.path, prepared.backupPath, constants.COPYFILE_EXCL)
    prepared.backupCreated = true
  }
  if (change.type === 'write-file') {
    await rename(prepared.temporaryPath!, change.path)
    prepared.touched = true
  }
  else {
    await rm(change.path)
    prepared.touched = true
  }
}

async function rollbackPreparedChange(prepared: PreparedChange): Promise<void> {
  const { change } = prepared
  if (!prepared.touched)
    return
  if (prepared.backupCreated && prepared.backupPath) {
    await rm(change.path, { force: true })
    await rename(prepared.backupPath, change.path)
    prepared.backupCreated = false
    return
  }
  await rm(change.path, { force: true })
}

async function cleanupPreparedChanges(preparedChanges: PreparedChange[], removeBackups: boolean, hooks: ChangePlanApplyHooks): Promise<CleanupFailure[]> {
  const failures: CleanupFailure[] = []
  await Promise.all(preparedChanges.flatMap((prepared) => {
    const paths = [prepared.temporaryPath]
    if (removeBackups)
      paths.push(prepared.backupPath)
    return paths.filter((path): path is string => Boolean(path)).map(async (path) => {
      try {
        await hooks.beforeCleanup?.(path)
        await rm(path, { force: true })
      }
      catch (error) {
        failures.push({ path, error: error instanceof Error ? error.message : String(error) })
      }
    })
  }))
  return failures
}

export async function applyChangePlan(plan: ChangePlan, hooks: ChangePlanApplyHooks = {}): Promise<ApplyResult> {
  const transactionId = `${process.pid}-${Date.now()}-${randomUUID()}`
  const preparedChanges: PreparedChange[] = []
  const applied: PreparedChange[] = []
  try {
    for (const change of plan.changes)
      await assertUnchanged(change)
    for (const [index, change] of plan.changes.entries())
      preparedChanges.push(await prepareChange(change, transactionId, index))
    for (const [index, prepared] of preparedChanges.entries()) {
      await hooks.beforeCommit?.(prepared.change, index)
      await commitChange(prepared, transactionId, index, hooks)
      applied.push(prepared)
    }
    const cleanupFailures = await cleanupPreparedChanges(preparedChanges, true, hooks)
    if (cleanupFailures.length > 0) {
      throw new ChangePlanCleanupError({
        applied: applied.map(item => item.change.path),
        cleanupFailures,
      })
    }
    return { changed: applied.length > 0, applied: applied.map(item => item.change), rolledBack: false }
  }
  catch (error) {
    if (error instanceof ChangePlanCleanupError)
      throw error
    const rollbackTargets = preparedChanges.filter(change => change.touched).reverse()
    const rolledBack: string[] = []
    const rollbackFailures: RollbackFailure[] = []
    for (const [index, prepared] of rollbackTargets.entries()) {
      try {
        await hooks.beforeRollback?.(prepared.change, index)
        await rollbackPreparedChange(prepared)
        rolledBack.push(prepared.change.path)
      }
      catch (rollbackError) {
        rollbackFailures.push({
          path: prepared.change.path,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          ...(prepared.backupCreated && prepared.backupPath ? { backupPath: prepared.backupPath } : {}),
        })
      }
    }
    const cleanupFailures = await cleanupPreparedChanges(preparedChanges, rollbackFailures.length === 0, hooks)
    throw new ChangePlanApplyError({
      cause: error,
      applied: applied.map(item => item.change.path),
      rolledBack,
      rollbackFailures,
      cleanupFailures,
    })
  }
}

export function mergeChangePlans(summary: string, plans: ChangePlan[]): ChangePlan {
  const changes: PlannedFileChange[] = []
  const targets = new Map<string, PlannedFileChange>()
  for (const change of plans.flatMap(plan => plan.changes)) {
    const existing = targets.get(change.path)
    if (!existing) {
      targets.set(change.path, change)
      changes.push(change)
      continue
    }
    if (existing.type !== change.type || existing.allowedRoot !== change.allowedRoot || existing.before !== change.before || existing.after !== change.after)
      throw new Error(`Conflicting planned changes for ${change.path}`)
  }
  return {
    id: plans.map(plan => plan.id).join('+') || 'empty',
    summary,
    changes,
    warnings: plans.flatMap(plan => plan.warnings),
    requiresConfirmation: plans.some(plan => plan.requiresConfirmation),
  }
}

export function formatChangePlan(plan: ChangePlan, cwd = process.cwd()): string {
  const lines = [plan.summary]
  if (plan.changes.length === 0)
    lines.push('No changes required.')
  for (const change of plan.changes) {
    const path = relative(cwd, change.path) || change.path
    lines.push(`${change.type}: ${path}`, `  ${change.reason}`)
    lines.push(...getSafePreview(change).map(line => `  ${line}`))
  }
  for (const warning of plan.warnings)
    lines.push(`warning: ${warning}`)
  return lines.join('\n')
}

function getSafePreview(change: PlannedFileChange): string[] {
  if (change.preview?.length)
    return change.preview
  if (change.type === 'delete-file' || change.after === undefined)
    return ['- delete file']
  return [change.before === undefined ? '+ create file' : '~ update file']
}

export function toPublicChangePlan(plan: ChangePlan, cwd = process.cwd()): PublicChangePlan {
  return {
    id: plan.id,
    summary: plan.summary,
    changes: plan.changes.map(change => ({
      type: change.type,
      path: relative(cwd, change.path) || change.path,
      reason: change.reason,
      preview: getSafePreview(change),
    })),
    warnings: [...plan.warnings],
    requiresConfirmation: plan.requiresConfirmation,
  }
}

export async function confirmChangePlan(plan: ChangePlan, options: { yes?: boolean, cwd?: string } = {}): Promise<boolean> {
  if (plan.changes.length === 0 || options.yes)
    return true
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Refusing to modify files in a non-interactive session without --yes. Use --dry-run to preview.')

  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    process.stdout.write(`${formatChangePlan(plan, options.cwd)}\n`)
    const answer = await prompt.question(`Apply ${plan.changes.length} change${plan.changes.length === 1 ? '' : 's'}? [y/N] `)
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes'
  }
  finally {
    prompt.close()
  }
}

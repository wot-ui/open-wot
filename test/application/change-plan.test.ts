import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyChangePlan, ChangePlanApplyError, ChangePlanCleanupError, formatChangePlan, mergeChangePlans, toPublicChangePlan } from '../../src/application/change-plan'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('change plan transaction', () => {
  it('deduplicates identical changes from composed onboarding plans', () => {
    const change = { type: 'write-file' as const, path: '/tmp/open-wot-test', allowedRoot: '/tmp', before: undefined, after: 'next', reason: 'same' }
    const plan = mergeChangePlans('merged', [
      { id: 'one', summary: 'one', changes: [change], warnings: [], requiresConfirmation: true },
      { id: 'two', summary: 'two', changes: [{ ...change }], warnings: [], requiresConfirmation: true },
    ])
    expect(plan.changes).toHaveLength(1)
    expect(formatChangePlan(plan, '/tmp')).toContain('+ create file')
    expect(toPublicChangePlan(plan, '/tmp')).toEqual(expect.objectContaining({
      changes: [expect.objectContaining({ path: 'open-wot-test', preview: ['+ create file'] })],
    }))
    expect(JSON.stringify(toPublicChangePlan(plan, '/tmp'))).not.toContain('next')
  })

  it('preflights every target before changing files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'open-wot-plan-'))
    directories.push(directory)
    const first = join(directory, 'first.json')
    const second = join(directory, 'second.json')
    await writeFile(first, 'before-first')
    await writeFile(second, 'changed-after-plan')

    const operation = applyChangePlan({
      id: 'rollback',
      summary: 'rollback test',
      warnings: [],
      requiresConfirmation: true,
      changes: [
        { type: 'write-file', path: first, allowedRoot: directory, before: 'before-first', after: 'after-first', reason: 'first' },
        { type: 'write-file', path: second, allowedRoot: directory, before: 'before-second', after: 'after-second', reason: 'second' },
      ],
    })
    await expect(operation).rejects.toMatchObject({
      name: 'ChangePlanApplyError',
      applied: [],
      rolledBack: [],
      rollbackFailures: [],
    })

    expect(await readFile(first, 'utf8')).toBe('before-first')
    expect(await readFile(second, 'utf8')).toBe('changed-after-plan')
  })

  it.skipIf(process.platform === 'win32')('rejects a project target whose parent symlink escapes the allowed root', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'open-wot-plan-root-'))
    directories.push(directory)
    const project = join(directory, 'project')
    const outside = join(directory, 'outside')
    await mkdir(project)
    await mkdir(outside)
    await symlink(outside, join(project, '.cursor'), 'dir')
    const target = join(project, '.cursor', 'mcp.json')

    await expect(applyChangePlan({
      id: 'escaped-root',
      summary: 'escaped root test',
      warnings: [],
      requiresConfirmation: true,
      changes: [{ type: 'write-file', path: target, allowedRoot: project, before: undefined, after: '{}\n', reason: 'test root boundary' }],
    })).rejects.toMatchObject({
      name: 'ChangePlanApplyError',
      message: expect.stringContaining('outside allowed root'),
    })
    await expect(readFile(join(outside, 'mcp.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rolls back earlier files when a later commit fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'open-wot-commit-plan-'))
    directories.push(directory)
    const first = join(directory, 'first.json')
    const second = join(directory, 'second.json')
    await writeFile(first, 'before-first')
    await writeFile(second, 'before-second')

    const operation = applyChangePlan({
      id: 'commit-rollback',
      summary: 'commit rollback test',
      warnings: [],
      requiresConfirmation: true,
      changes: [
        { type: 'write-file', path: first, allowedRoot: directory, before: 'before-first', after: 'after-first', reason: 'first' },
        { type: 'write-file', path: second, allowedRoot: directory, before: 'before-second', after: 'after-second', reason: 'second' },
      ],
    }, {
      beforeCommit: (_change, index) => {
        if (index === 1)
          throw new Error('simulated commit failure')
      },
    })

    await expect(operation).rejects.toMatchObject({
      applied: [first],
      rolledBack: [first],
      rollbackFailures: [],
    })
    expect(await readFile(first, 'utf8')).toBe('before-first')
    expect(await readFile(second, 'utf8')).toBe('before-second')
  })

  it('preserves the original file when creating its rollback backup fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'open-wot-backup-failure-'))
    directories.push(directory)
    const target = join(directory, 'config.json')
    await writeFile(target, 'before')

    await expect(applyChangePlan({
      id: 'backup-failure',
      summary: 'backup failure test',
      warnings: [],
      requiresConfirmation: true,
      changes: [{ type: 'write-file', path: target, allowedRoot: directory, before: 'before', after: 'after', reason: 'update' }],
    }, {
      beforeBackup: async (_change, backupPath) => mkdir(backupPath),
    })).rejects.toMatchObject({
      name: 'ChangePlanApplyError',
      applied: [],
      rolledBack: [],
    })

    expect(await readFile(target, 'utf8')).toBe('before')
  })

  it('reports rollback failures and retains the backup path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'open-wot-rollback-failure-'))
    directories.push(directory)
    const first = join(directory, 'first.json')
    const second = join(directory, 'second.json')
    await writeFile(first, 'before-first')
    await writeFile(second, 'before-second')

    const operation = applyChangePlan({
      id: 'rollback-failure',
      summary: 'rollback failure test',
      warnings: [],
      requiresConfirmation: true,
      changes: [
        { type: 'write-file', path: first, allowedRoot: directory, before: 'before-first', after: 'after-first', reason: 'first' },
        { type: 'write-file', path: second, allowedRoot: directory, before: 'before-second', after: 'after-second', reason: 'second' },
      ],
    }, {
      beforeCommit: (_change, index) => {
        if (index === 1)
          throw new Error('simulated commit failure')
      },
      beforeRollback: () => {
        throw new Error('simulated rollback failure')
      },
    })

    await expect(operation).rejects.toMatchObject({
      name: 'ChangePlanApplyError',
      applied: [first],
      rolledBack: [],
      rollbackFailures: [expect.objectContaining({ path: first, backupPath: expect.stringContaining('.rollback') })],
      message: expect.stringContaining('rollback incomplete'),
    })
  })

  it('reports cleanup failures without rolling back an already committed change', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'open-wot-cleanup-failure-'))
    directories.push(directory)
    const target = join(directory, 'config.json')
    await writeFile(target, 'before')

    const error = await applyChangePlan({
      id: 'cleanup-failure',
      summary: 'cleanup failure test',
      warnings: [],
      requiresConfirmation: true,
      changes: [{ type: 'write-file', path: target, allowedRoot: directory, before: 'before', after: 'after', reason: 'update' }],
    }, {
      beforeCleanup: (path) => {
        if (path.endsWith('.rollback'))
          throw new Error('simulated cleanup failure')
      },
    }).catch(cause => cause as ChangePlanCleanupError)

    expect(error).toBeInstanceOf(ChangePlanCleanupError)
    expect(error).toMatchObject({
      applied: [target],
      cleanupFailures: [expect.objectContaining({ path: expect.stringContaining('.rollback') })],
    })
    if (!(error instanceof ChangePlanCleanupError))
      throw new TypeError('Expected ChangePlanCleanupError')
    expect(await readFile(target, 'utf8')).toBe('after')
    expect(await readFile(error.cleanupFailures[0]!.path, 'utf8')).toBe('before')
  })

  it('restores deleted files when a later change fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'open-wot-delete-plan-'))
    directories.push(directory)
    const first = join(directory, 'first.json')
    const second = join(directory, 'second.json')
    await writeFile(first, 'keep-me')
    await writeFile(second, 'before-second')

    await expect(applyChangePlan({
      id: 'delete-rollback',
      summary: 'delete rollback test',
      warnings: [],
      requiresConfirmation: true,
      changes: [
        { type: 'delete-file', path: first, allowedRoot: directory, before: 'keep-me', reason: 'delete first' },
        { type: 'write-file', path: second, allowedRoot: directory, before: 'before-second', after: 'after-second', reason: 'second' },
      ],
    }, {
      beforeCommit: (_change, index) => {
        if (index === 1)
          throw new Error('simulated commit failure')
      },
    })).rejects.toBeInstanceOf(ChangePlanApplyError)

    expect(await readFile(first, 'utf8')).toBe('keep-me')
    expect(await readFile(second, 'utf8')).toBe('before-second')
  })

  it('rejects plans that write and delete the same path', () => {
    const path = '/tmp/open-wot-conflict'
    expect(() => mergeChangePlans('conflict', [
      { id: 'write', summary: 'write', warnings: [], requiresConfirmation: true, changes: [{ type: 'write-file', path, allowedRoot: '/tmp', before: 'before', after: 'after', reason: 'write' }] },
      { id: 'delete', summary: 'delete', warnings: [], requiresConfirmation: true, changes: [{ type: 'delete-file', path, allowedRoot: '/tmp', before: 'before', reason: 'delete' }] },
    ])).toThrow(`Conflicting planned changes for ${path}`)
  })
})

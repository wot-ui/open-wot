import type { Command } from 'commander'
import process from 'node:process'
import { beforeEach, vi } from 'vitest'

export function setupCliIo(): { stdout: ReturnType<typeof vi.spyOn>, error: ReturnType<typeof vi.spyOn> } {
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    stdout.mockClear()
    error.mockClear()
    process.exitCode = undefined
  })

  return { stdout, error }
}

export async function runCli(program: Command, args: string[]): Promise<void> {
  await program.parseAsync(args, { from: 'user' })
}

export function joinedStdout(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call: unknown[]) => String(call[0] ?? '')).join('')
}

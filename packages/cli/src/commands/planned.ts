import type { Command } from 'commander'
import process from 'node:process'
import { addQueryOptions, normalizeQueryOptions, printError } from './shared'

export function registerPlannedCommand(program: Command, name: string, description: string): void {
  addQueryOptions(program.command(name).description(description))
    .action((options) => {
      const query = normalizeQueryOptions(options)
      printError(`Command \"${name}\" is planned but not implemented yet.`, query.format)
      process.exitCode = 1
    })
}

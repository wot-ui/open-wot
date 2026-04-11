import type { Command } from 'commander'
import process from 'node:process'
import { listComponents } from '../data/metadata'
import { addQueryOptions, getComponentDescription, getComponentLabel, normalizeQueryOptions, printError } from './shared'

export function registerListCommand(program: Command): void {
  addQueryOptions(program.command('list').description('List available wot-ui components'))
    .action((options) => {
      const query = normalizeQueryOptions(options)
      try {
        const components = listComponents(query.version)
        if (query.format === 'json') {
          console.log(JSON.stringify({ components }, null, 2))
          return
        }

        const lines = components.map(component => `- ${getComponentLabel(component, query.lang)} (${component.tag}): ${getComponentDescription(component, query.lang)}`)
        console.log(lines.join('\n'))
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to list components', query.format)
        process.exitCode = 1
      }
    })
}

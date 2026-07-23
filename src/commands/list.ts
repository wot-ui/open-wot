import type { Command } from 'commander'
import process from 'node:process'
import { filterComponents, listComponents } from '../data/metadata'
import { writeJson, writeLine } from '../utils/output'
import { addQueryOptions, getComponentDescription, getComponentLabel, normalizeQueryOptions, printError } from './shared'

export function registerListCommand(program: Command): void {
  addQueryOptions(program.command('list').argument('[keyword]', 'Filter by component name, tag, category, or description').description('List available wot-ui components'))
    .action((keyword, options) => {
      const query = normalizeQueryOptions(options)
      try {
        const components = filterComponents(listComponents(query.version), keyword)
        if (query.format === 'json') {
          writeJson({ components })
          return
        }

        const lines = components.map(component => `- ${getComponentLabel(component)} (${component.tag}): ${getComponentDescription(component)}`)
        writeLine(lines.join('\n'))
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to list components', query.format)
        process.exitCode = 1
      }
    })
}

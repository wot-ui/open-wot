import type { Command } from 'commander'
import process from 'node:process'
import { findComponent } from '../data/metadata'
import { addQueryOptions, normalizeQueryOptions, printError } from './shared'

export function registerDocCommand(program: Command): void {
  addQueryOptions(program.command('doc').argument('<component>', 'Component name or wd-* tag').description('Print component markdown documentation'))
    .action((componentName, options) => {
      const query = normalizeQueryOptions(options)
      try {
        const component = findComponent(componentName, query.version)
        if (!component?.doc) {
          printError(`Documentation not found: ${componentName}`, query.format)
          process.exitCode = 1
          return
        }

        if (query.format === 'json') {
          console.log(JSON.stringify({ name: component.name, doc: component.doc }, null, 2))
          return
        }

        console.log(component.doc)
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to load documentation', query.format)
        process.exitCode = 1
      }
    })
}

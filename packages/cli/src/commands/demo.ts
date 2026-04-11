import type { Command } from 'commander'
import process from 'node:process'
import { findComponent } from '../data/metadata'
import { addQueryOptions, normalizeQueryOptions, printError } from './shared'

export function registerDemoCommand(program: Command): void {
  addQueryOptions(program.command('demo').argument('<component>', 'Component name or wd-* tag').argument('[name]', 'Demo name').description('Show component demo source code'))
    .action((componentName, demoName, options) => {
      const query = normalizeQueryOptions(options)
      try {
        const component = findComponent(componentName, query.version)
        if (!component) {
          printError(`Component not found: ${componentName}`, query.format)
          process.exitCode = 1
          return
        }

        const demos = component.demos ?? []
        if (!demoName) {
          if (query.format === 'json') {
            console.log(JSON.stringify({ component: component.name, demos }, null, 2))
            return
          }
          console.log(demos.map(demo => `- ${demo.name}: ${demo.title}`).join('\n'))
          return
        }

        const demo = demos.find(item => item.name.toLowerCase() === demoName.toLowerCase())
        if (!demo) {
          printError(`Demo not found: ${demoName}`, query.format)
          process.exitCode = 1
          return
        }

        if (query.format === 'json') {
          console.log(JSON.stringify({ component: component.name, demo }, null, 2))
          return
        }

        console.log(demo.code)
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to load demo', query.format)
        process.exitCode = 1
      }
    })
}

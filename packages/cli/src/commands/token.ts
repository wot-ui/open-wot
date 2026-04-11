import type { Command } from 'commander'
import process from 'node:process'
import { findComponent, listComponents } from '../data/metadata'
import { addQueryOptions, formatCssVars, normalizeQueryOptions, printError } from './shared'

export function registerTokenCommand(program: Command): void {
  addQueryOptions(program.command('token').argument('[component]', 'Component name or wd-* tag').description('Query component CSS variables'))
    .action((componentName, options) => {
      const query = normalizeQueryOptions(options)
      try {
        if (!componentName) {
          const tokens = listComponents(query.version).flatMap(component => component.cssVars.map(cssVar => ({
            component: component.name,
            ...cssVar,
          })))
          console.log(JSON.stringify(tokens, null, 2))
          return
        }

        const component = findComponent(componentName, query.version)
        if (!component) {
          printError(`Component not found: ${componentName}`, query.format)
          process.exitCode = 1
          return
        }

        if (query.format === 'json') {
          console.log(JSON.stringify({ name: component.name, cssVars: formatCssVars(component.cssVars) }, null, 2))
          return
        }

        const lines = [component.name, ...component.cssVars.map((cssVar) => {
          const defaultValue = cssVar.defaultValue ?? cssVar.token
          return `- ${cssVar.name}${defaultValue ? ` = ${defaultValue}` : ''}: ${cssVar.description}`
        })]
        console.log(lines.join('\n'))
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to query CSS variables', query.format)
        process.exitCode = 1
      }
    })
}

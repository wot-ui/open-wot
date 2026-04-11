import type { Command } from 'commander'
import process from 'node:process'
import { findComponent, listComponents } from '../data/metadata'
import { writeJson, writeLine } from '../utils/output'
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
          writeJson(tokens)
          return
        }

        const component = findComponent(componentName, query.version)
        if (!component) {
          printError(`Component not found: ${componentName}`, query.format)
          process.exitCode = 1
          return
        }

        if (query.format === 'json') {
          writeJson({ name: component.name, cssVars: formatCssVars(component.cssVars) })
          return
        }

        const lines = [component.name, ...component.cssVars.map((cssVar) => {
          const defaultValue = cssVar.defaultValue ?? cssVar.token
          return `- ${cssVar.name}${defaultValue ? ` = ${defaultValue}` : ''}: ${cssVar.description}`
        })]
        writeLine(lines.join('\n'))
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to query CSS variables', query.format)
        process.exitCode = 1
      }
    })
}

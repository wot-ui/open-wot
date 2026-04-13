import type { Command } from 'commander'
import process from 'node:process'
import { findComponent } from '../data/metadata'
import { writeJson, writeLine } from '../utils/output'
import { addQueryOptions, getComponentDescription, getComponentLabel, normalizeQueryOptions, printError } from './shared'

export function registerInfoCommand(program: Command): void {
  addQueryOptions(program.command('info').argument('<component>', 'Component name or wd-* tag').description('Show component props, events, slots and CSS variables'))
    .action((componentName, options) => {
      const query = normalizeQueryOptions(options)
      try {
        const component = findComponent(componentName, query.version)
        if (!component) {
          printError(`Component not found: ${componentName}`, query.format)
          process.exitCode = 1
          return
        }

        if (query.format === 'json') {
          writeJson(component)
          return
        }

        const lines = [
          `${getComponentLabel(component)} (${component.tag})`,
          getComponentDescription(component),
          '',
          'Props:',
          ...component.props.map(prop => `- ${prop.name}: ${prop.type}${prop.default ? ` = ${prop.default}` : ''} | ${prop.description}`),
          '',
          'Events:',
          ...component.events.map(event => `- ${event.name}${event.payload ? ` (${event.payload})` : ''}: ${event.description}`),
          '',
          'Slots:',
          ...component.slots.map(slot => `- ${slot.name}: ${slot.description}`),
          '',
          'CSS Variables:',
          ...component.cssVars.map((cssVar) => {
            const defaultValue = cssVar.defaultValue ?? cssVar.token
            return `- ${cssVar.name}${defaultValue ? ` = ${defaultValue}` : ''}: ${cssVar.description}`
          }),
        ]
        writeLine(lines.join('\n'))
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to load component info', query.format)
        process.exitCode = 1
      }
    })
}

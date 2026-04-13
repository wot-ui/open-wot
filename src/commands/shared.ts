import type { Command } from 'commander'
import type { ComponentMeta, CssVarMeta, QueryOptions } from '../types'
import { writeJson } from '../utils/output'

export function addQueryOptions(command: Command): Command {
  return command
    .option('--format <format>', 'output format: text, json, markdown', 'text')
    .option('--version <version>', 'target wot-ui version')
}

export function normalizeQueryOptions(options: Record<string, unknown>): QueryOptions {
  const format = options.format === 'json' || options.format === 'markdown' ? options.format : 'text'
  return {
    format,
    version: typeof options.version === 'string' ? options.version : undefined,
  }
}

export function printError(message: string, format: QueryOptions['format']): void {
  if (format === 'json')
    writeJson({ error: true, message })
  else
    console.error(message)
}

export function getComponentLabel(component: ComponentMeta): string {
  return `${component.name} ${component.nameZh}`
}

export function getComponentDescription(component: ComponentMeta): string {
  return component.descriptionZh
}

export function formatCssVars(cssVars: CssVarMeta[]): Array<Record<string, string>> {
  return cssVars.map(cssVar => ({
    name: cssVar.name,
    defaultValue: cssVar.defaultValue ?? cssVar.token ?? '-',
    description: cssVar.description,
  }))
}

import type { Command } from 'commander'
import type { ComponentMeta, CssVarMeta, QueryOptions } from '../types'
import { detectVersion } from '../data/version'
import { writeJson } from '../utils/output'
import { formatLogMessage, writeStderrLine } from '../utils/terminal'

export function addQueryOptions(command: Command): Command {
  return command
    .option('--format <format>', 'output format: text, json, markdown', 'text')
    .option('--version <version>', 'target wot-ui version')
}

export function normalizeQueryOptions(options: Record<string, unknown>): QueryOptions {
  const format = options.format === 'json' || options.format === 'markdown' ? options.format : 'text'
  const flagVersion = typeof options.version === 'string' ? options.version : undefined
  const info = detectVersion(flagVersion)
  if (info.source === 'fallback') {
    writeStderrLine(formatLogMessage('warn', `Version not detected in project, falling back to ${info.version}`))
  }
  return {
    format,
    version: info.version,
  }
}

export function printError(message: string, format: QueryOptions['format']): void {
  if (format === 'json')
    writeJson({ error: true, message })
  else
    console.error(formatLogMessage('error', message))
}

export function parsePositiveIntegerOption(value: string | undefined, defaultValue: number, optionName: string): number {
  if (value === undefined)
    return defaultValue
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`Invalid ${optionName} value "${value}". Expected a positive integer.`)
  return parsed
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

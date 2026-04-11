import type { Command } from 'commander'
import type { ComponentMeta, CssVarMeta, OutputLanguage, QueryOptions } from '../types'

export function addQueryOptions(command: Command): Command {
  return command
    .option('--format <format>', 'output format: text, json, markdown', 'text')
    .option('--lang <lang>', 'output language: zh, en', 'zh')
    .option('--version <version>', 'target wot-ui version')
}

export function normalizeQueryOptions(options: Record<string, unknown>): QueryOptions {
  const format = options.format === 'json' || options.format === 'markdown' ? options.format : 'text'
  const lang = options.lang === 'en' ? 'en' : 'zh'
  return {
    format,
    lang,
    version: typeof options.version === 'string' ? options.version : undefined,
  }
}

export function printError(message: string, format: QueryOptions['format']): void {
  if (format === 'json')
    console.log(JSON.stringify({ error: true, message }, null, 2))
  else
    console.error(message)
}

export function getComponentLabel(component: ComponentMeta, lang: OutputLanguage): string {
  return lang === 'zh' ? `${component.name} ${component.nameZh}` : component.name
}

export function getComponentDescription(component: ComponentMeta, lang: OutputLanguage): string {
  return lang === 'zh' ? component.descriptionZh : component.description
}

export function formatCssVars(cssVars: CssVarMeta[]): Array<Record<string, string>> {
  return cssVars.map(cssVar => ({
    name: cssVar.name,
    defaultValue: cssVar.defaultValue ?? cssVar.token ?? '-',
    description: cssVar.description,
  }))
}

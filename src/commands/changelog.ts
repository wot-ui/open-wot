import type { Command } from 'commander'
import process from 'node:process'
import { loadMetadataFile } from '../data/loader'
import { resolveVersion } from '../data/version'
import { writeJson, writeLine } from '../utils/output'
import { addQueryOptions, normalizeQueryOptions, printError } from './shared'

export function registerChangelogCommand(program: Command): void {
  addQueryOptions(program.command('changelog').argument('[versionOrComponent]', 'Version or component name').argument('[component]', 'Optional component name').description('Show changelog entries'))
    .action((versionOrComponent, componentArg, options) => {
      const query = normalizeQueryOptions(options)
      try {
        const metadata = loadMetadataFile(resolveVersion(query.version))
        let versionFilter: string | undefined
        let componentFilter: string | undefined

        if (versionOrComponent && /^v?\d/.test(versionOrComponent))
          versionFilter = versionOrComponent
        else if (versionOrComponent)
          componentFilter = versionOrComponent

        if (componentArg)
          componentFilter = componentArg

        const entries = (metadata.changelog ?? []).filter((entry) => {
          const versionMatches = versionFilter ? entry.version === versionFilter || `v${entry.version}` === versionFilter : true
          const componentMatches = componentFilter
            ? (entry.components ?? []).some(component => component.toLowerCase() === componentFilter.toLowerCase())
            : true
          return versionMatches && componentMatches
        })

        if (query.format === 'json') {
          writeJson({ entries })
          return
        }

        const lines = entries.flatMap(entry => [
          `${entry.version}${entry.date ? ` (${entry.date})` : ''}`,
          entry.summary,
          ...entry.highlights.map(item => `- ${item}`),
          '',
        ])
        writeLine(lines.join('\n').trim())
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to load changelog', query.format)
        process.exitCode = 1
      }
    })
}

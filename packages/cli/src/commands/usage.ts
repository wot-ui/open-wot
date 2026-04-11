import type { Command } from 'commander'
import { resolve } from 'node:path'
import process from 'node:process'
import { analyzeUsage } from '../utils/scanner'
import { addQueryOptions, normalizeQueryOptions, printError } from './shared'

export function registerUsageCommand(program: Command): void {
  addQueryOptions(program.command('usage').argument('[dir]', 'Project directory', '.').description('Analyze project usage of wot-ui'))
    .action((dir, options) => {
      const query = normalizeQueryOptions(options)
      try {
        const report = analyzeUsage(resolve(dir), query.version)
        if (query.format === 'json') {
          console.log(JSON.stringify(report, null, 2))
          return
        }

        const lines = [
          `Scanned files: ${report.scannedFiles}`,
          'Components:',
          ...report.components.map(component => `- ${component.name} (${component.tag}): ${component.count} in ${component.files.join(', ')}`),
        ]
        if (report.imports.length) {
          lines.push('', 'Imports:', ...report.imports.map(item => `- ${item}`))
        }
        console.log(lines.join('\n'))
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to analyze project usage', query.format)
        process.exitCode = 1
      }
    })
}

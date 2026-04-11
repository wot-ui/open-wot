import type { Command } from 'commander'
import { resolve } from 'node:path'
import process from 'node:process'
import { lintProject } from '../utils/scanner'
import { addQueryOptions, normalizeQueryOptions, printError } from './shared'

export function registerLintCommand(program: Command): void {
  addQueryOptions(program.command('lint').argument('[dir]', 'Project directory', '.').description('Lint wot-ui usage'))
    .action((dir, options) => {
      const query = normalizeQueryOptions(options)
      try {
        const report = lintProject(resolve(dir), query.version)
        if (query.format === 'json') {
          console.log(JSON.stringify(report, null, 2))
          return
        }

        if (!report.issues.length) {
          console.log(`No lint issues found. Scanned files: ${report.scannedFiles}`)
          return
        }

        const lines = [
          `Scanned files: ${report.scannedFiles}`,
          ...report.issues.map(issue => `${issue.severity.toUpperCase()} ${issue.file}:${issue.line} [${issue.rule}] ${issue.message}`),
        ]
        console.log(lines.join('\n'))
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to lint project', query.format)
        process.exitCode = 1
      }
    })
}

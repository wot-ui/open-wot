import type { Command } from 'commander'
import { resolve } from 'node:path'
import process from 'node:process'
import { writeJson, writeLine } from '../utils/output'
import { diagnoseProject } from '../utils/project'
import { addQueryOptions, normalizeQueryOptions, printError } from './shared'

export function registerDoctorCommand(program: Command): void {
  addQueryOptions(program.command('doctor').argument('[dir]', 'Project directory', '.').description('Diagnose a wot-ui project'))
    .action((dir, options) => {
      const query = normalizeQueryOptions(options)
      try {
        const report = diagnoseProject(resolve(dir))
        if (query.format === 'json') {
          writeJson(report)
          return
        }

        const lines = [
          `Directory: ${report.dir}`,
          ...report.checks.map(check => `${check.status.toUpperCase()} ${check.name}: ${check.message}${check.suggestion ? ` | ${check.suggestion}` : ''}`),
        ]
        writeLine(lines.join('\n'))
      }
      catch (error) {
        printError(error instanceof Error ? error.message : 'Failed to diagnose project', query.format)
        process.exitCode = 1
      }
    })
}

import { Command } from 'commander'
import packageJson from '../package.json'
import { registerChangelogCommand } from './commands/changelog'
import { registerDemoCommand } from './commands/demo'
import { registerDocCommand } from './commands/doc'
import { registerDoctorCommand } from './commands/doctor'
import { registerInfoCommand } from './commands/info'
import { registerLintCommand } from './commands/lint'
import { registerListCommand } from './commands/list'
import { registerMcpCommand } from './commands/mcp'
import { registerTokenCommand } from './commands/token'
import { registerUsageCommand } from './commands/usage'

export function createCliProgram(): Command {
  const program = new Command()

  program
    .name('wot')
    .description('wot-ui AI toolkit CLI')
    .version(packageJson.version)

  registerListCommand(program)
  registerInfoCommand(program)
  registerDocCommand(program)
  registerDemoCommand(program)
  registerTokenCommand(program)
  registerChangelogCommand(program)
  registerDoctorCommand(program)
  registerUsageCommand(program)
  registerLintCommand(program)
  registerMcpCommand(program)

  return program
}

import { describe, expect, it } from 'vitest'
import packageJson from '../package.json'
import { createCliProgram } from '../src/app'

describe('app cli registration', () => {
  it('registers all expected commands', () => {
    const program = createCliProgram()
    const commandNames = program.commands.map(command => command.name()).sort()

    expect(commandNames).toEqual([
      'changelog',
      'demo',
      'doc',
      'doctor',
      'info',
      'lint',
      'list',
      'mcp',
      'token',
      'usage',
    ])
  })

  it('uses package metadata on cli root', () => {
    const program = createCliProgram()
    expect(program.name()).toBe('wot')
    expect(program.version()).toBe(packageJson.version)
  })
})

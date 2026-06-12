#!/usr/bin/env node
import process from 'node:process'
import packageJson from '../package.json'
import { createCliProgram } from './app'
import { checkForCliUpdate } from './utils/update-check'

// eslint-disable-next-line antfu/no-top-level-await
await checkForCliUpdate({
  args: process.argv,
  currentVersion: packageJson.version,
  packageName: packageJson.name,
})

// eslint-disable-next-line antfu/no-top-level-await
await createCliProgram().parseAsync(process.argv)

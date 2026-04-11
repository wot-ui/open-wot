#!/usr/bin/env node
import process from 'node:process'
import { createCliProgram } from './app'

// eslint-disable-next-line antfu/no-top-level-await
await createCliProgram().parseAsync(process.argv)

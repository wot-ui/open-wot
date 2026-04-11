#!/usr/bin/env node
import process from 'node:process'
import { createCliProgram } from './app'

await createCliProgram().parseAsync(process.argv)

import type { CliUpdateStatus } from './update-check'
import process from 'node:process'

type TerminalLevel = 'error' | 'hint' | 'info' | 'success' | 'update' | 'warn'
type StatusLevel = 'error' | 'fail' | 'ok' | 'pass' | 'warn' | 'warning'

interface TerminalFormatOptions {
  env?: NodeJS.ProcessEnv
  isTty?: boolean
}

const ANSI = {
  cyan: ['\x1B[36m', '\x1B[39m'],
  dim: ['\x1B[2m', '\x1B[22m'],
  green: ['\x1B[32m', '\x1B[39m'],
  red: ['\x1B[31m', '\x1B[39m'],
  yellow: ['\x1B[33m', '\x1B[39m'],
} as const

export function supportsColor(options: TerminalFormatOptions = {}): boolean {
  const env = options.env ?? process.env
  const isTty = options.isTty ?? process.stderr.isTTY
  if (!isTty)
    return false
  if ('NO_COLOR' in env || env.FORCE_COLOR === '0' || env.TERM === 'dumb')
    return false
  return true
}

export function writeStderrLine(message: string): void {
  process.stderr.write(`${message}\n`)
}

export function formatLogMessage(level: TerminalLevel, message: string, options: TerminalFormatOptions = {}): string {
  const color = createColorizer(options)
  const prefix = color.dim('[wot]')
  const styled = styleLevel(level, message, color)
  return `${prefix} ${styled}`
}

export function formatStatusLabel(status: StatusLevel, options: TerminalFormatOptions = {}): string {
  const normalized = status.toUpperCase()
  const color = createColorizer(options)
  if (status === 'ok' || status === 'pass')
    return color.green(normalized)
  if (status === 'warn' || status === 'warning')
    return color.yellow(normalized)
  return color.red(normalized)
}

export function formatCommand(command: string, options: TerminalFormatOptions = {}): string {
  return createColorizer(options).cyan(command)
}

export function formatUpdateNotice(status: CliUpdateStatus, options: TerminalFormatOptions = {}): string {
  const color = createColorizer(options)
  const currentVersion = color.dim(status.currentVersion)
  const latestVersion = color.green(status.latestVersion ?? 'unknown')
  return [
    formatLogMessage('update', 'Update available', options),
    `${color.dim('[wot]')} ${status.packageName}  ${currentVersion} -> ${latestVersion}`,
    `${color.dim('[wot]')} Run: ${formatCommand(status.command, options)}`,
  ].join('\n')
}

function createColorizer(options: TerminalFormatOptions): Record<keyof typeof ANSI, (value: string) => string> {
  const enabled = supportsColor(options)
  return {
    cyan: value => applyAnsi(value, ANSI.cyan, enabled),
    dim: value => applyAnsi(value, ANSI.dim, enabled),
    green: value => applyAnsi(value, ANSI.green, enabled),
    red: value => applyAnsi(value, ANSI.red, enabled),
    yellow: value => applyAnsi(value, ANSI.yellow, enabled),
  }
}

function styleLevel(level: TerminalLevel, message: string, color: Record<keyof typeof ANSI, (value: string) => string>): string {
  if (level === 'error')
    return color.red(message)
  if (level === 'success')
    return color.green(message)
  if (level === 'warn' || level === 'update')
    return color.yellow(message)
  if (level === 'hint')
    return color.cyan(message)
  return message
}

function applyAnsi(value: string, code: readonly [string, string], enabled: boolean): string {
  return enabled ? `${code[0]}${value}${code[1]}` : value
}

import { spawn } from 'node:child_process'
import process from 'node:process'
import { stripVTControlCharacters } from 'node:util'
import { redactSensitiveText } from '../../utils/redaction'

const TERMINATION_GRACE_MS = 500

export interface ClientCommandResult {
  exitCode?: number
  stdout: string
  stderr: string
  timedOut: boolean
  error?: string
}

export async function runClientCommand(
  executable: string,
  args: string[],
  options: { cwd: string, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, timeoutMs?: number },
): Promise<ClientCommandResult> {
  const platform = options.platform ?? process.platform
  const useShell = platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)
  const totalTimeoutMs = Math.max(1, options.timeoutMs ?? 5_000)
  const terminationGraceMs = Math.min(TERMINATION_GRACE_MS, Math.floor(totalTimeoutMs / 5))
  const commandTimeoutMs = totalTimeoutMs - terminationGraceMs
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: useShell,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let timer: NodeJS.Timeout | undefined
    let terminationTimer: NodeJS.Timeout | undefined
    const finish = (result: Omit<ClientCommandResult, 'stdout' | 'stderr'>): void => {
      if (settled)
        return
      settled = true
      if (timer)
        clearTimeout(timer)
      if (terminationTimer)
        clearTimeout(terminationTimer)
      resolve({ ...result, stdout: stdout.slice(-8_000), stderr: stderr.slice(-8_000) })
    }
    timer = setTimeout(() => {
      timedOut = true
      if (platform === 'win32' && child.pid) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        })
        killer.once('error', () => child.kill('SIGTERM'))
      }
      else {
        child.kill('SIGTERM')
      }
      terminationTimer = setTimeout(() => child.kill('SIGKILL'), terminationGraceMs)
      terminationTimer.unref()
    }, commandTimeoutMs)
    timer.unref()
    child.stdout.on('data', chunk => stdout += chunk.toString('utf8'))
    child.stderr.on('data', chunk => stderr += chunk.toString('utf8'))
    child.once('error', error => finish(timedOut
      ? { timedOut: true, error: `Client command timed out after ${totalTimeoutMs}ms` }
      : { timedOut: false, error: error.message }))
    child.once('close', code => finish(timedOut
      ? { timedOut: true, error: `Client command timed out after ${totalTimeoutMs}ms` }
      : { timedOut: false, ...(code === null ? {} : { exitCode: code }) }))
  })
}

export function clientCommandOutput(result: ClientCommandResult): string {
  return redactSensitiveText(stripVTControlCharacters(`${result.stdout}\n${result.stderr}`).trim())
}

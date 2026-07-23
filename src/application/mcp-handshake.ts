import type { Buffer } from 'node:buffer'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { McpServerDefinition } from '../mcp/clients'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { LATEST_PROTOCOL_VERSION, ReadBuffer, serializeMessage } from '@modelcontextprotocol/server'

export interface McpHandshakeResult {
  ok: boolean
  protocolVersion?: string
  serverName?: string
  serverVersion?: string
  tools: string[]
  durationMs: number
  error?: string
  stderr?: string
}

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void
  reject: (error: Error) => void
}

export function resolveMcpSpawnCommand(command: string, platform: NodeJS.Platform): { executable: string, useShell: boolean } {
  const executable = platform === 'win32' && !/\.(?:exe|cmd|bat|com)$/i.test(command)
    ? `${command}.cmd`
    : command
  return {
    executable,
    useShell: platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable),
  }
}

async function waitForChildClose(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null)
    return true
  return new Promise((resolve) => {
    let timer: NodeJS.Timeout
    const onClose = (): void => {
      clearTimeout(timer)
      resolve(true)
    }
    timer = setTimeout(() => {
      child.off('close', onClose)
      resolve(false)
    }, timeoutMs)
    timer.unref()
    child.once('close', onClose)
  })
}

async function terminate(child: ChildProcessWithoutNullStreams, platform: NodeJS.Platform, deadline: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null)
    return
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
  const gracefulWaitMs = Math.min(1_000, Math.max(0, deadline - Date.now()))
  if (await waitForChildClose(child, gracefulWaitMs))
    return
  child.kill('SIGKILL')
  const forceWaitMs = Math.min(500, Math.max(0, deadline - Date.now()))
  if (forceWaitMs > 0)
    await waitForChildClose(child, forceWaitMs)
}

export async function verifyMcpHandshake(
  server: McpServerDefinition,
  options: { cwd?: string, env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, timeoutMs?: number } = {},
): Promise<McpHandshakeResult> {
  const startedAt = Date.now()
  const timeoutMs = options.timeoutMs ?? 10_000
  const deadline = startedAt + timeoutMs
  const platform = options.platform ?? process.platform
  const spawnCommand = resolveMcpSpawnCommand(server.command, platform)
  const child = spawn(spawnCommand.executable, server.args, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env, ...server.env, WOT_DISABLE_UPDATE_CHECK: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: spawnCommand.useShell,
  })
  const pending = new Map<number, PendingRequest>()
  const readBuffer = new ReadBuffer()
  let stderr = ''
  let nextId = 1

  const failPending = (error: Error): void => {
    for (const request of pending.values())
      request.reject(error)
    pending.clear()
  }

  child.stdout.on('data', (chunk: Buffer) => {
    try {
      readBuffer.append(chunk)
      while (true) {
        const message = readBuffer.readMessage()
        if (message === null)
          break
        if ('id' in message && typeof message.id === 'number') {
          const request = pending.get(message.id)
          if (!request)
            continue
          pending.delete(message.id)
          if ('error' in message)
            request.reject(new Error(`${message.error.code}: ${message.error.message}`))
          else if ('result' in message)
            request.resolve(message.result as Record<string, unknown>)
          else
            request.reject(new Error('Unexpected JSON-RPC request from MCP server'))
        }
      }
    }
    catch (error) {
      failPending(error instanceof Error ? error : new Error(String(error)))
    }
  })
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = `${stderr}${chunk.toString('utf8')}`.slice(-4_000)
  })
  child.once('error', failPending)
  child.stdin.once('error', failPending)
  child.once('exit', (code, signal) => {
    failPending(new Error(`MCP server exited before verification completed (${signal ?? code ?? 'unknown'})`))
  })

  const sendRequest = (method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const id = nextId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      child.stdin.write(serializeMessage({ jsonrpc: '2.0', id, method, params }))
    })
  }

  const timeout = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP handshake timed out after ${timeoutMs}ms`)), timeoutMs)
    timer.unref()
  })

  try {
    const initialize = await Promise.race([
      sendRequest('initialize', {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'open-wot-doctor', version: '1.0.0' },
      }),
      timeout,
    ])
    child.stdin.write(serializeMessage({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }))
    const toolResult = await Promise.race([sendRequest('tools/list', {}), timeout])
    const tools = Array.isArray(toolResult.tools)
      ? toolResult.tools.flatMap((tool) => {
          if (!tool || typeof tool !== 'object')
            return []
          const name = (tool as Record<string, unknown>).name
          return typeof name === 'string' ? [name] : []
        })
      : []
    const serverInfo = initialize.serverInfo && typeof initialize.serverInfo === 'object'
      ? initialize.serverInfo as Record<string, unknown>
      : {}
    return {
      ok: true,
      protocolVersion: typeof initialize.protocolVersion === 'string' ? initialize.protocolVersion : undefined,
      serverName: typeof serverInfo.name === 'string' ? serverInfo.name : undefined,
      serverVersion: typeof serverInfo.version === 'string' ? serverInfo.version : undefined,
      tools,
      durationMs: Date.now() - startedAt,
      ...(stderr.trim() ? { stderr: stderr.trim() } : {}),
    }
  }
  catch (error) {
    return {
      ok: false,
      tools: [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      ...(stderr.trim() ? { stderr: stderr.trim() } : {}),
    }
  }
  finally {
    failPending(new Error('MCP verification finished'))
    await terminate(child, platform, deadline)
  }
}

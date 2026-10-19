import { createHash } from 'node:crypto'
import { access, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const inject = ['loader', 'tools']
export const name = 'open-wot-project-bridge'
export const declarationPath = '.dsh/wot-ui.json'

export function digest(source) {
  return createHash('sha256').update(source).digest('hex')
}

function keys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key))
}

export function parseDeclaration(source) {
  let value
  try {
    value = JSON.parse(source)
  }
  catch { throw new Error('Invalid DeepSeek project JSON') }
  const server = value?.server
  if (!keys(value, ['schemaVersion', 'server']) || value.schemaVersion !== 1
    || !keys(server, ['command', 'args']) || server.command !== 'npx'
    || !Array.isArray(server.args) || server.args.length !== 3
    || server.args[0] !== '-y' || server.args[2] !== 'mcp'
    || typeof server.args[1] !== 'string'
    || !/^@wot-ui\/cli(?:@[a-z\d][\w.+-]*)?$/i.test(server.args[1])) {
    throw new Error('Unsupported DeepSeek project declaration; use wot mcp print --client deepseek')
  }
  return value
}

export function validateRegistry(config) {
  if (!keys(config, ['schemaVersion', 'bridgeHash', 'projects']) || config.schemaVersion !== 1
    || !/^[a-f\d]{64}$/.test(config.bridgeHash) || !Array.isArray(config.projects)
    || config.projects.some(project => !keys(project, ['root', 'digest'])
      || typeof project.root !== 'string' || !isAbsolute(project.root) || resolve(project.root) !== project.root
      || !/^[a-f\d]{64}$/.test(project.digest))
    || new Set(config.projects.map(project => project.root)).size !== config.projects.length) {
    throw new Error('Conflicting or modified DeepSeek project bridge registration')
  }
  return config
}

export function within(root, path) {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export async function gitRoot(cwd) {
  let current = await realpath(cwd)
  for (;;) {
    try {
      await access(join(current, '.git'))
      return current
    }
    catch (error) {
      if (error.code !== 'ENOENT')
        throw error
    }
    const parent = dirname(current)
    if (parent === current)
      return undefined
    current = parent
  }
}

export class DeepseekProjectLocationError extends Error {}

export async function installRoot(cwd) {
  const root = await realpath(cwd)
  if (!(await stat(root)).isDirectory())
    throw new Error('DeepSeek project cwd must be a directory')
  const git = await gitRoot(root)
  if (git && git !== root)
    throw new DeepseekProjectLocationError(`Run from the Git root using --cwd ${JSON.stringify(git)}`)
  return root
}

export async function selectProject(cwd, projects) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd))
    return undefined
  const actual = await realpath(cwd)
  const git = await gitRoot(actual)
  const candidates = projects.filter(project => git ? project.root === git : within(project.root, actual))
    .sort((a, b) => b.root.length - a.root.length)
  for (const project of candidates) {
    // A registration is tied to its real directory, not a movable symlink.
    if (await realpath(project.root) === project.root)
      return project
  }
}

export async function readDeclaration(root) {
  const path = join(root, declarationPath)
  if (!within(root, await realpath(path)))
    throw new Error('DeepSeek project declaration escapes its registered root')
  const source = await readFile(path, 'utf8')
  return { source, declaration: parseDeclaration(source) }
}

export async function apply(ctx, config) {
  validateRegistry(config)
  const mounts = new Map()
  let stopped = false
  let modulePromise
  const cleanup = async () => {
    stopped = true
    await Promise.all([...mounts.values()].map(record => record.dispose()))
  }
  ctx.effect(() => cleanup)
  ctx.on('agent/created', async ({ agent, signal }) => {
    if (stopped || signal?.aborted || mounts.has(agent))
      return
    const record = {
      disposed: false,
      fiber: undefined,
      disposal: undefined,
      dispose() {
        this.disposed = true
        // Share pending/successful cleanup; let later lifecycles retry failures.
        this.disposal ??= Promise.resolve().then(() => this.fiber?.dispose()).catch((error) => {
          this.disposal = undefined
          throw error
        })
        return this.disposal
      },
    }
    mounts.set(agent, record)
    const cancel = () => {
      void record.dispose().catch(() => {})
    }
    signal?.addEventListener('abort', cancel, { once: true })
    const release = agent.ctx.effect(() => async () => {
      await record.dispose()
      if (mounts.get(agent) === record)
        mounts.delete(agent)
    })
    let diagnostic = 'project directory could not be resolved'
    try {
      const project = await selectProject(agent.session.header.cwd, config.projects)
      if (!project) {
        await release()
        return
      }
      diagnostic = 'project declaration is unreadable or invalid'
      const { source, declaration } = await readDeclaration(project.root)
      diagnostic = 'project declaration changed; run init to renew its registration'
      if (digest(source) !== project.digest)
        throw new Error('Project declaration changed; run wot agent init --client deepseek again')
      diagnostic = 'global wot-ui service conflicts with project isolation'
      if (ctx.tools.schemas(agent).some(tool => tool.name.startsWith('mcp__wot-ui__')))
        throw new Error('Global wot-ui service conflicts with project isolation; remove its user/profile registration')
      diagnostic = 'host module resolution is incompatible with the project bridge'
      modulePromise ??= Promise.all([
        ctx.loader.import('@deepseek-ai/dsh-mcp-client'),
        ctx.loader.import('@deepseek-ai/dsh-scope'),
      ])
      const [plugin, { scopeOf }] = await modulePromise
      // A global client may be connecting or expose no tools yet. Inspect its
      // public loader identity as well as the visible tool namespace.
      diagnostic = 'global wot-ui registration conflicts with project isolation'
      for (const entry of ctx.loader.entries()) {
        if (!entry.disabled && scopeOf(entry.context) === undefined
          && entry.options.name === '@deepseek-ai/dsh-mcp-client'
          && (entry.fiber?.config ?? entry.options.config)?.serverName === 'wot-ui') {
          throw new Error('Global wot-ui registration conflicts with project isolation')
        }
      }
      if (stopped || record.disposed || signal?.aborted)
        return
      diagnostic = 'project MCP startup failed or was cancelled'
      record.fiber = agent.ctx.plugin(plugin, {
        ...declaration.server,
        serverName: 'wot-ui',
        transport: 'stdio',
        cwd: project.root,
        failOnStartupError: true,
        reconnect: { enabled: false },
      })
      await record.fiber.await()
      if (stopped || record.disposed || signal?.aborted)
        await record.dispose()
    }
    catch {
      await record.dispose().catch(() => {})
      // Never log parser, command or plugin errors: they may include project secrets.
      ctx.logger.warn(`open-wot: ${diagnostic}. Run wot agent doctor --client deepseek; reopen the session after fixing it.`)
    }
    finally {
      signal?.removeEventListener('abort', cancel)
    }
  })
}

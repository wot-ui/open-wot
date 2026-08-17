import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyChangePlan } from '../../src/application/change-plan'
import { createMcpServerDefinition } from '../../src/application/mcp-onboarding'
import { antigravityAdapter } from '../../src/mcp/clients/antigravity'
import { claudeAdapter } from '../../src/mcp/clients/claude'
import { codexAdapter } from '../../src/mcp/clients/codex'
import { cursorAdapter } from '../../src/mcp/clients/cursor'
import { findExecutable } from '../../src/mcp/clients/detect'
import { opencodeAdapter } from '../../src/mcp/clients/opencode'
import { vscodeAdapter } from '../../src/mcp/clients/vscode'

const temporaryDirectories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'open-wot-mcp-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function context(cwd: string, homeDir: string, scope: 'project' | 'user' = 'project') {
  return {
    cwd,
    homeDir,
    scope,
    server: createMcpServerDefinition(),
    env: { PATH: '' },
    platform: process.platform,
  } as const
}

describe('mcp client adapters', () => {
  it('preserves JSONC comments and unrelated Cursor servers', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.cursor', 'mcp.json')
    await mkdir(join(cwd, '.cursor'), { recursive: true })
    await writeFile(path, `{
  // keep this comment
  "mcpServers": {
    "other": { "command": "other", "args": [] },
  },
}
`)

    const install = await cursorAdapter.planInstall(context(cwd, homeDir))
    expect(install.changes).toHaveLength(1)
    await applyChangePlan(install)

    const content = await readFile(path, 'utf8')
    expect(content).toContain('// keep this comment')
    expect(content).toContain('"other"')
    expect(content).toContain('"wot-ui"')
    expect((await cursorAdapter.inspect(context(cwd, homeDir))).matches).toBe(true)
    expect((await cursorAdapter.planInstall(context(cwd, homeDir))).changes).toHaveLength(0)

    await applyChangePlan(await cursorAdapter.planRemove(context(cwd, homeDir)))
    const removed = await readFile(path, 'utf8')
    expect(removed).toContain('// keep this comment')
    expect(removed).toContain('"other"')
    expect(removed).not.toContain('"wot-ui"')
  })

  it('uses each client-specific project path and root key', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()

    const claude = await claudeAdapter.planInstall(context(cwd, homeDir))
    const vscode = await vscodeAdapter.planInstall(context(cwd, homeDir))
    const antigravity = await antigravityAdapter.planInstall(context(cwd, homeDir))

    expect(claude.changes[0]?.path).toBe(join(cwd, '.mcp.json'))
    expect(claude.changes[0]?.after).toContain('"mcpServers"')
    expect(vscode.changes[0]?.path).toBe(join(cwd, '.vscode', 'mcp.json'))
    expect(vscode.changes[0]?.after).toContain('"servers"')
    expect(antigravity.changes[0]?.path).toBe(join(cwd, '.agents', 'mcp_config.json'))
    expect(antigravity.changes[0]?.after).toContain('"mcpServers"')
  })

  it('reports disabled Antigravity servers and required tool filters as mismatches', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.agents', 'mcp_config.json')
    await mkdir(join(cwd, '.agents'), { recursive: true })
    await writeFile(path, JSON.stringify({
      mcpServers: {
        'wot-ui': {
          ...createMcpServerDefinition(),
          disabled: true,
        },
      },
    }))

    await expect(antigravityAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: false,
      problem: expect.stringContaining('disabled in Antigravity'),
    })

    await writeFile(path, JSON.stringify({
      mcpServers: {
        'wot-ui': {
          ...createMcpServerDefinition(),
          disabledTools: ['wot_list'],
        },
      },
    }))
    await expect(antigravityAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: false,
      problem: expect.stringContaining('wot_list'),
    })
  })

  it('detects Antigravity IDE through its command-line launcher', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const bin = await temporaryDirectory()
    const executable = join(bin, process.platform === 'win32' ? 'agy-ide.CMD' : 'agy-ide')
    await writeFile(executable, '')
    if (process.platform !== 'win32')
      await chmod(executable, 0o755)

    await expect(antigravityAdapter.detect({
      cwd,
      homeDir,
      env: { PATH: bin },
      platform: process.platform,
    })).resolves.toMatchObject({
      installed: true,
      executable,
    })
  })

  it('preserves OpenCode JSONC and maps the stdio command to a local server', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, 'opencode.jsonc')
    await writeFile(path, `{
  // keep this comment
  "mcp": {
    "other": { "type": "local", "command": ["other"], "enabled": true },
  },
}
`)

    await applyChangePlan(await opencodeAdapter.planInstall(context(cwd, homeDir)))

    const content = await readFile(path, 'utf8')
    expect(content).toContain('// keep this comment')
    expect(content).toContain('"other"')
    expect(content).toContain('"command": [')
    expect(content).toContain('"@wot-ui/cli"')
    expect(await opencodeAdapter.inspect(context(cwd, homeDir))).toMatchObject({
      path,
      matches: true,
      server: createMcpServerDefinition(),
    })
    expect((await opencodeAdapter.planInstall(context(cwd, homeDir))).changes).toHaveLength(0)

    await applyChangePlan(await opencodeAdapter.planRemove(context(cwd, homeDir)))
    const removed = await readFile(path, 'utf8')
    expect(removed).toContain('// keep this comment')
    expect(removed).toContain('"other"')
    expect(removed).not.toContain('"wot-ui"')
  })

  it('uses the OpenCode user config and rejects disabled local servers', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const userContext = context(cwd, homeDir, 'user')
    const install = await opencodeAdapter.planInstall(userContext)
    expect(install.changes[0]?.path).toBe(join(homeDir, '.config', 'opencode', 'opencode.json'))
    await applyChangePlan(install)
    expect((await opencodeAdapter.inspect(userContext)).matches).toBe(true)

    const projectPath = join(cwd, 'opencode.json')
    await writeFile(projectPath, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['npx', '-y', '@wot-ui/cli', 'mcp'],
          enabled: false,
        },
      },
    }))
    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: false,
      problem: expect.stringContaining('not an enabled OpenCode local MCP server'),
    })
  })

  it('uses XDG_CONFIG_HOME for the OpenCode user config', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const configHome = await temporaryDirectory()
    const userContext = {
      ...context(cwd, homeDir, 'user'),
      env: { PATH: '', XDG_CONFIG_HOME: configHome },
    }
    const path = join(configHome, 'opencode', 'opencode.json')

    const install = await opencodeAdapter.planInstall(userContext)
    expect(install.changes[0]?.path).toBe(path)
    await applyChangePlan(install)
    await expect(opencodeAdapter.inspect(userContext)).resolves.toMatchObject({ path, matches: true })
  })

  it('manages an existing OpenCode config under the .opencode directory', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.opencode', 'opencode.jsonc')
    await mkdir(join(cwd, '.opencode'), { recursive: true })
    await writeFile(path, `{
  // keep nested config comments
  "mcp": {
    "other": { "type": "local", "command": ["other"] },
  },
}
`)

    await applyChangePlan(await opencodeAdapter.planInstall(context(cwd, homeDir)))
    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({ path, matches: true })

    await applyChangePlan(await opencodeAdapter.planRemove(context(cwd, homeDir)))
    const removed = await readFile(path, 'utf8')
    expect(removed).toContain('// keep nested config comments')
    expect(removed).toContain('"other"')
    expect(removed).not.toContain('"wot-ui"')
  })

  it('uses the highest-priority OpenCode server definition and removes every definition', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const directPath = join(cwd, 'opencode.json')
    const nestedPath = join(cwd, '.opencode', 'opencode.jsonc')
    await mkdir(join(cwd, '.opencode'), { recursive: true })
    await writeFile(directPath, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['npx', '-y', '@wot-ui/cli', 'mcp'],
          enabled: true,
        },
      },
    }))
    await writeFile(nestedPath, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['other'],
          enabled: false,
        },
      },
    }))

    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      path: nestedPath,
      matches: false,
    })
    const install = await opencodeAdapter.planInstall(context(cwd, homeDir))
    expect(install.changes.map(change => change.path)).toEqual([nestedPath])
    await applyChangePlan(install)
    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      path: nestedPath,
      matches: true,
    })

    const remove = await opencodeAdapter.planRemove(context(cwd, homeDir))
    expect(remove.changes.map(change => change.path)).toEqual([directPath, nestedPath])
    await applyChangePlan(remove)
    expect(await readFile(directPath, 'utf8')).not.toContain('"wot-ui"')
    expect(await readFile(nestedPath, 'utf8')).not.toContain('"wot-ui"')
  })

  it('prefers OpenCode JSONC when JSON and JSONC coexist in the same directory', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const jsonPath = join(cwd, 'opencode.json')
    const jsoncPath = join(cwd, 'opencode.jsonc')
    await writeFile(jsonPath, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['npx', '-y', '@wot-ui/cli', 'mcp'],
          enabled: true,
        },
      },
    }))
    await writeFile(jsoncPath, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['other'],
          enabled: false,
        },
      },
    }))

    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      path: jsoncPath,
      matches: false,
    })
    const install = await opencodeAdapter.planInstall(context(cwd, homeDir))
    expect(install.changes.map(change => change.path)).toEqual([jsoncPath])
  })

  it('reports OpenCode filters that disable required MCP tools', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, 'opencode.json')
    await writeFile(path, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['npx', '-y', '@wot-ui/cli', 'mcp'],
          enabled: true,
        },
      },
      tools: {
        'wot-ui_*': false,
      },
    }))

    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: false,
      problem: expect.stringContaining('wot_status, wot_list'),
    })
  })

  it('inspects the effective OpenCode server after deep-merging config files', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const directPath = join(cwd, 'opencode.json')
    const nestedPath = join(cwd, '.opencode', 'opencode.jsonc')
    await mkdir(join(cwd, '.opencode'), { recursive: true })
    await writeFile(directPath, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['npx', '-y', '@wot-ui/cli', 'mcp'],
          enabled: false,
        },
      },
    }))
    await writeFile(nestedPath, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['npx', '-y', '@wot-ui/cli', 'mcp'],
        },
      },
    }))

    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      path: nestedPath,
      configured: true,
      matches: false,
      problem: expect.stringContaining('not an enabled OpenCode local MCP server'),
    })

    await applyChangePlan(await opencodeAdapter.planInstall(context(cwd, homeDir)))
    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      path: nestedPath,
      matches: true,
    })
  })

  it('ignores inherited OpenCode server fields from unsafe JSON keys', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, 'opencode.json')
    await writeFile(path, `{
  "mcp": {
    "wot-ui": {
      "__proto__": {
        "type": "local",
        "command": ["npx", "-y", "@wot-ui/cli", "mcp"],
        "enabled": true
      }
    }
  }
}
`)

    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: false,
      problem: expect.stringContaining('not an enabled OpenCode local MCP server'),
    })
  })

  it('normalizes scalar OpenCode permissions and applies permissions after legacy tool filters', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const directPath = join(cwd, 'opencode.json')
    const nestedPath = join(cwd, '.opencode', 'opencode.jsonc')
    await mkdir(join(cwd, '.opencode'), { recursive: true })
    await writeFile(directPath, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['npx', '-y', '@wot-ui/cli', 'mcp'],
          enabled: true,
        },
      },
      permission: 'deny',
    }))

    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      matches: false,
      problem: expect.stringContaining('wot_status, wot_list'),
    })

    await writeFile(directPath, JSON.stringify({
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['npx', '-y', '@wot-ui/cli', 'mcp'],
          enabled: true,
        },
      },
      permission: {
        'wot-ui_*': 'allow',
      },
    }))
    await writeFile(nestedPath, JSON.stringify({
      tools: {
        'wot-ui_*': false,
      },
    }))

    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: true,
    })
  })

  it('preserves OpenCode last-matching permission rule order', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, 'opencode.json')
    const config = {
      mcp: {
        'wot-ui': {
          type: 'local',
          command: ['npx', '-y', '@wot-ui/cli', 'mcp'],
          enabled: true,
        },
      },
    }
    await writeFile(path, JSON.stringify({
      ...config,
      permission: {
        'wot-ui_wot_status': 'allow',
        'wot-ui_wot_list': 'allow',
        'wot-ui_*': 'deny',
      },
    }))

    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      matches: false,
      problem: expect.stringContaining('wot_status, wot_list'),
    })

    await writeFile(path, JSON.stringify({
      ...config,
      permission: {
        'wot-ui_*': 'deny',
        'wot-ui_wot_status': 'allow',
        'wot-ui_wot_list': 'allow',
      },
    }))
    await expect(opencodeAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({ matches: true })
  })

  it('preserves CRLF formatting and supports user scope', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(homeDir, '.cursor', 'mcp.json')
    await mkdir(join(homeDir, '.cursor'), { recursive: true })
    await writeFile(path, '{\r\n  "mcpServers": {}\r\n}\r\n')

    const userContext = context(cwd, homeDir, 'user')
    await applyChangePlan(await cursorAdapter.planInstall(userContext))
    const content = await readFile(path, 'utf8')
    expect(content).toContain('\r\n')
    expect(content.replace(/\r\n/g, '')).not.toContain('\n')
    expect((await cursorAdapter.inspect(userContext)).matches).toBe(true)
  })

  it('rejects malformed JSON server environments instead of treating null as empty', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.cursor', 'mcp.json')
    await mkdir(join(cwd, '.cursor'), { recursive: true })
    await writeFile(path, JSON.stringify({
      mcpServers: {
        'wot-ui': {
          command: 'npx',
          args: ['-y', '@wot-ui/cli', 'mcp'],
          env: null,
        },
      },
    }))

    await expect(cursorAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: false,
      problem: expect.stringContaining('not a supported stdio server'),
    })
  })

  it('manages only the marked Codex TOML section', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.codex', 'config.toml')
    await mkdir(join(cwd, '.codex'), { recursive: true })
    await writeFile(path, 'model = "gpt-test"\n')

    await applyChangePlan(await codexAdapter.planInstall(context(cwd, homeDir)))
    const installed = await readFile(path, 'utf8')
    expect(installed).toContain('model = "gpt-test"')
    expect(installed).toContain('[mcp_servers.wot-ui]')
    expect((await codexAdapter.inspect(context(cwd, homeDir))).matches).toBe(true)
    expect((await codexAdapter.planInstall(context(cwd, homeDir))).changes).toHaveLength(0)

    await applyChangePlan(await codexAdapter.planRemove(context(cwd, homeDir)))
    expect(await readFile(path, 'utf8')).toBe('model = "gpt-test"\n')
  })

  it('updates the managed Codex TOML section with replacement tokens as literal text', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.codex', 'config.toml')
    await mkdir(join(cwd, '.codex'), { recursive: true })
    await writeFile(path, `model = "gpt-test"
# open-wot managed mcp server start
[mcp_servers.wot-ui]
command = "npx"
args = ["-y", "@wot-ui/cli@1.0.3", "mcp"]
# open-wot managed mcp server end
`)

    const updatedContext = {
      ...context(cwd, homeDir),
      server: {
        command: 'npx',
        args: ['-y', '@wot-ui/cli@$&', 'mcp'],
      },
    }
    await applyChangePlan(await codexAdapter.planInstall(updatedContext))

    const content = await readFile(path, 'utf8')
    expect(content).toContain('model = "gpt-test"')
    expect(content).toContain('"@wot-ui/cli@$&"')
    expect(content).not.toContain('@wot-ui/cli@1.0.3')
    expect((await codexAdapter.inspect(updatedContext)).matches).toBe(true)
  })

  it('does not read another Codex MCP server as the wot-ui section', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.codex', 'config.toml')
    await mkdir(join(cwd, '.codex'), { recursive: true })
    await writeFile(path, `[mcp_servers.wot-ui]
enabled = true

[mcp_servers.other]
command = "npx"
args = ["-y", "@wot-ui/cli", "mcp"]
`)

    await expect(codexAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: false,
      problem: expect.stringContaining('not a supported stdio server'),
    })
  })

  it('reports disabled Codex servers and required tool filters as mismatches', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.codex', 'config.toml')
    await mkdir(join(cwd, '.codex'), { recursive: true })
    await writeFile(path, `[mcp_servers.wot-ui]
command = "npx"
args = ["-y", "@wot-ui/cli", "mcp"]
enabled = false
`)

    await expect(codexAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: false,
      problem: expect.stringContaining('disabled'),
    })

    await writeFile(path, `[mcp_servers.wot-ui]
command = "npx"
args = ["-y", "@wot-ui/cli", "mcp"]
enabled_tools = ["wot_status"]
`)
    await expect(codexAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      configured: true,
      matches: false,
      problem: expect.stringContaining('wot_list'),
    })
  })

  it('rejects invalid Codex TOML instead of reporting the managed block as healthy', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.codex', 'config.toml')
    await mkdir(join(cwd, '.codex'), { recursive: true })
    const content = 'broken = [\n'
    await writeFile(path, content)

    await expect(codexAdapter.planInstall(context(cwd, homeDir))).rejects.toThrow('Invalid TOML')
    await expect(codexAdapter.inspect(context(cwd, homeDir))).resolves.toMatchObject({
      matches: false,
      problem: expect.stringContaining('Invalid TOML'),
    })
    expect(await readFile(path, 'utf8')).toBe(content)
  })

  it('refuses to take over or remove an external nested wot-ui TOML table', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.codex', 'config.toml')
    await mkdir(join(cwd, '.codex'), { recursive: true })
    const content = `[mcp_servers.wot-ui]
command = "custom"
args = []

[mcp_servers.wot-ui.env]
TOKEN = "secret"
`
    await writeFile(path, content)

    await expect(codexAdapter.planInstall(context(cwd, homeDir))).rejects.toThrow('nested mcp_servers.wot-ui')
    expect(await readFile(path, 'utf8')).toBe(content)

    const managed = `# open-wot managed mcp server start
[mcp_servers.wot-ui]
command = "npx"
args = ["-y", "@wot-ui/cli", "mcp"]
# open-wot managed mcp server end

[mcp_servers.wot-ui.env]
TOKEN = "secret"
`
    await writeFile(path, managed)
    await expect(codexAdapter.planRemove(context(cwd, homeDir))).rejects.toThrow('nested mcp_servers.wot-ui')
    expect(await readFile(path, 'utf8')).toBe(managed)
  })

  it('refuses quoted child tables that extend the managed Codex server', async () => {
    const cwd = await temporaryDirectory()
    const homeDir = await temporaryDirectory()
    const path = join(cwd, '.codex', 'config.toml')
    await mkdir(join(cwd, '.codex'), { recursive: true })
    const content = `# open-wot managed mcp server start
[mcp_servers.wot-ui]
command = "npx"
args = ["-y", "@wot-ui/cli", "mcp"]
# open-wot managed mcp server end

["mcp_servers"."wot-ui".env]
TOKEN = "secret"
`
    await writeFile(path, content)

    await expect(codexAdapter.planInstall(context(cwd, homeDir))).rejects.toThrow('outside the open-wot managed block')
    await expect(codexAdapter.planRemove(context(cwd, homeDir))).rejects.toThrow('outside the open-wot managed block')
    expect(await readFile(path, 'utf8')).toBe(content)
  })

  it('detects Windows command shims using PATHEXT', async () => {
    const root = await temporaryDirectory()
    const bin = join(root, 'Program Files', 'Cursor')
    await mkdir(bin, { recursive: true })
    const executable = join(bin, 'cursor-agent.CMD')
    await writeFile(executable, '')

    await expect(findExecutable(['cursor-agent'], {
      cwd: bin,
      homeDir: bin,
      env: { PATH: bin, PATHEXT: '.EXE;.CMD' },
      platform: 'win32',
    })).resolves.toBe(executable)
  })
})

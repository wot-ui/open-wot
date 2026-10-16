import type { CST, Node, YAMLMap, YAMLSeq } from 'yaml'
import type { McpServerDefinition } from './types'
import { isAlias, isMap, isScalar, isSeq, parseDocument, stringify, visit } from 'yaml'

const ENTRY_ID = 'open-wot-mcp'
const PLUGIN = '@deepseek-ai/dsh-mcp-client'

interface PatchEntry {
  insert: { id: string, name: string, config: { serverName: string, transport: string, command: string, args: string[] } }[]
}

function entry(server: McpServerDefinition): PatchEntry {
  return { insert: [{ id: ENTRY_ID, name: PLUGIN, config: { serverName: 'wot-ui', transport: 'stdio', command: server.command, args: server.args } }] }
}

export function printDeepseekConfig(server: McpServerDefinition): string {
  return stringify([entry(server)])
}

function conflict(): never {
  throw new Error('Conflicting or modified DeepSeek wot-ui configuration; preserve it and resolve the open-wot-mcp / wot-ui entries manually.')
}

export function hasKeys(node: YAMLMap, keys: string[]): boolean {
  return node.items.length === keys.length && keys.every(key => node.has(key))
}

interface ParsedConfig {
  root?: YAMLSeq<Node>
  doc: ReturnType<typeof parseDocument>
  index: number
  server?: McpServerDefinition
  packageNode?: Node
}

function parseConfig(source: string): ParsedConfig {
  const doc = parseDocument(source, { keepSourceTokens: true, prettyErrors: false, strict: true })
  if (doc.errors.length) {
    const error = doc.errors[0]!
    // Never include parser messages: they can quote credentials from the source.
    throw new Error(`Invalid DeepSeek YAML (${error.code}) at offset ${error.pos[0]}`)
  }
  const root = doc.contents
  const empty = root === null || (isScalar(root) && root.value === null && root.source === '')
  if (!empty && !isSeq(root))
    throw new Error('DeepSeek configuration must be a YAML patch list')
  let identityCount = 0
  let serverCount = 0
  visit(doc, {
    Alias() {
      // An alias can hide a second registration or a later override.
      throw new Error('DeepSeek YAML aliases cannot be edited safely; resolve aliases before managing wot-ui')
    },
    Map(_key, node) {
      if (node.get('id') === ENTRY_ID)
        identityCount++
      if (node.get('serverName') === 'wot-ui')
        serverCount++
    },
  })
  if (empty)
    return { root: undefined, doc, index: -1, server: undefined }
  const list = root as YAMLSeq<Node>
  if (list.tag || list.anchor)
    throw new Error('Tagged or anchored DeepSeek patch lists cannot be edited safely')
  const index = list.items.findIndex((patch) => {
    if (!isMap(patch))
      return false
    const inserted = patch.get('insert', true)
    return isSeq(inserted) && inserted.items.some(item => isMap(item) && item.get('id') === ENTRY_ID)
  })
  if (index === -1) {
    if (identityCount || serverCount)
      conflict()
    return { root: list, doc, index, server: undefined }
  }
  if (identityCount !== 1 || serverCount !== 1)
    conflict()
  const patch = list.items[index] as YAMLMap
  const inserted = patch.get('insert', true)
  if (!hasKeys(patch, ['insert']) || !isSeq(inserted) || inserted.items.length !== 1)
    conflict()
  const plugin = inserted.items[0]
  if (!isMap(plugin) || !hasKeys(plugin, ['id', 'name', 'config']) || plugin.get('name') !== PLUGIN)
    conflict()
  const config = plugin.get('config', true)
  if (!isMap(config) || !hasKeys(config, ['serverName', 'transport', 'command', 'args']) || config.get('transport') !== 'stdio' || config.get('command') !== 'npx')
    conflict()
  visit(patch, (_key, node) => {
    if (isAlias(node) || ((isMap(node) || isSeq(node) || isScalar(node)) && (node.tag || node.anchor)))
      conflict()
  })
  const args = config.get('args', true)
  if (!isSeq(args) || args.items.length !== 3 || !args.items.every(item => isScalar(item) && typeof item.value === 'string'))
    conflict()
  const values = args.items.map(item => (item as { value: string }).value)
  if (values[0] !== '-y' || values[2] !== 'mcp' || !/^@wot-ui\/cli(?:@\S+)?$/.test(values[1]!))
    conflict()
  return { root: list, doc, index, server: { command: 'npx', args: values }, packageNode: args.items[1] as Node }
}

export function inspectDeepseekConfig(source: string): McpServerDefinition | undefined {
  return parseConfig(source).server
}

interface Edit { start: number, end: number, text: string }

export function editSource(source: string, edits: Edit[]): string {
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  return source
}

export function comments(token: unknown): string[] {
  if (!token || typeof token !== 'object')
    return []
  const value = token as Record<string, unknown>
  if (value.type === 'comment')
    return [String(value.source)]
  return Object.values(value).flatMap(child => Array.isArray(child) ? child.flatMap(comments) : comments(child))
}

export function editDeepseekConfig(source: string, server: McpServerDefinition | undefined): string {
  const parsed = parseConfig(source)
  const { root, index } = parsed
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  let after: string
  if (index !== -1 && server) {
    if (JSON.stringify(parsed.server) === JSON.stringify(server))
      return source
    // Only change the version scalar; preserve even comments inside the managed row.
    const range = parsed.packageNode!.range!
    after = editSource(source, [{ start: range[0], end: range[1], text: JSON.stringify(server.args[1]) }])
  }
  else if (index !== -1 && root) {
    const node = root.items[index]!
    const token = root.srcToken as CST.BlockSequence | CST.FlowCollection
    const item = token.items[index]!
    const edits: Edit[] = []
    if (token.type === 'flow-collection') {
      const next = token.items[index + 1]?.start.find(part => part.type === 'comma')
      const previous = item.start.find(part => part.type === 'comma')
      const comma = next ?? previous
      if (comma)
        edits.push({ start: comma.offset, end: comma.offset + 1, text: '' })
      const kept = comments(item.value)
      edits.push({ start: node.range![0], end: node.range![1], text: kept.length ? `${eol}${kept.join(eol)}${eol}` : '' })
    }
    else {
      const indicator = item.start.find(part => part.type === 'seq-item-ind')!
      const kept = comments(item.value)
      const replacement = `${root.items.length === 1 ? `[]${eol}` : ''}${kept.length ? `${kept.join(eol)}${eol}` : ''}`
      edits.push({ start: indicator.offset, end: node.range![2], text: replacement })
    }
    after = editSource(source, edits)
  }
  else if (!server) {
    return source
  }
  else if (root?.flow) {
    const token = root.srcToken as CST.FlowCollection
    const offset = token.start.offset + 1
    after = editSource(source, [{ start: offset, end: offset, text: `${JSON.stringify(entry(server))}${root.items.length ? ',' : ''}` }])
  }
  else {
    const offset = root?.range?.[1] ?? parsed.doc.contents?.range?.[0] ?? parsed.doc.range?.[1] ?? source.length
    const prefix = offset > 0 && source[offset - 1] !== '\n' ? eol : ''
    after = editSource(source, [{ start: offset, end: offset, text: prefix + printDeepseekConfig(server).replaceAll('\n', eol) }])
  }
  // A malformed splice must never reach the filesystem.
  const result = parseConfig(after)
  if (Boolean(result.server) !== Boolean(server))
    throw new Error('Could not safely edit the DeepSeek patch list')
  return after
}

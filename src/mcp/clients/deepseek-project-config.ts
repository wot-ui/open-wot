import type { CST, Node, YAMLSeq } from 'yaml'
import type { BridgeConfig } from '../../../runtime/deepseek-project-bridge.mjs'
import { isAlias, isMap, isScalar, isSeq, parseDocument, stringify, visit } from 'yaml'
import { validateRegistry } from '../../../runtime/deepseek-project-bridge.mjs'
import { comments, editSource, hasKeys, inspectDeepseekConfig } from './deepseek-config'

const ID = 'open-wot-project-bridge'
function entry(path: string, config: BridgeConfig): { insert: { id: string, name: string, config: BridgeConfig }[] } {
  return { insert: [{ id: ID, name: path, config }] }
}
function conflict(): never {
  throw new Error('Conflicting or modified DeepSeek project bridge; preserve the patch and resolve open-wot-project-bridge manually')
}
function parse(source: string, path: string): { doc: ReturnType<typeof parseDocument>, root?: YAMLSeq<Node>, index: number, config?: BridgeConfig } {
  // Reuse syntax, alias and old global service protection without evaluating tags.
  inspectDeepseekConfig(source)
  const doc = parseDocument(source, { keepSourceTokens: true, prettyErrors: false, strict: true })
  const root = isSeq(doc.contents) ? doc.contents as YAMLSeq<Node> : undefined
  let count = 0
  visit(doc, { Map(_key, node) {
    if (node.get('id') === ID)
      count++
  } })
  const index = root?.items.findIndex((node) => {
    if (!isMap(node))
      return false
    const inserted = node.get('insert', true)
    return isSeq(inserted) && inserted.items.some(item => isMap(item) && item.get('id') === ID)
  }) ?? -1
  if (index === -1) {
    if (count)
      conflict()
    return { doc, root, index, config: undefined }
  }
  const patch = root!.items[index]
  if (count !== 1 || !isMap(patch) || !hasKeys(patch, ['insert']))
    conflict()
  const inserts = patch.get('insert', true)
  if (!isSeq(inserts) || inserts.items.length !== 1)
    conflict()
  const plugin = inserts.items[0]
  if (!isMap(plugin) || !hasKeys(plugin, ['id', 'name', 'config']) || plugin.get('name') !== path)
    conflict()
  visit(patch, (_key, node) => {
    if (isAlias(node) || ((isMap(node) || isSeq(node) || isScalar(node)) && (node.tag || node.anchor)))
      conflict()
  })
  const config = validateRegistry(plugin.get('config', true)?.toJSON())
  return { doc, root, index, config }
}
export function inspectProjectBridge(source: string, path: string): BridgeConfig | undefined {
  return parse(source, path).config
}
export function editProjectBridge(source: string, path: string, config?: BridgeConfig): string {
  if (config)
    validateRegistry(config)
  const { doc, root, index, config: current } = parse(source, path)
  if (JSON.stringify(config) === JSON.stringify(current))
    return source
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  let after: string
  if (root && index !== -1) {
    const node = root.items[index]!
    const token = root.srcToken as CST.BlockSequence | CST.FlowCollection
    const item = token.items[index]!
    const kept = comments(item.value)
    const note = kept.length ? `${kept.join(eol)}${eol}` : ''
    if (token.type === 'flow-collection') {
      const edits = [{ start: node.range![0], end: node.range![1], text: config ? `${JSON.stringify(entry(path, config))}${note ? `${eol}${note}` : ''}` : note ? `${eol}${note}` : '' }]
      if (!config) {
        const comma = token.items[index + 1]?.start.find(part => part.type === 'comma') ?? item.start.find(part => part.type === 'comma')
        if (comma)
          edits.push({ start: comma.offset, end: comma.offset + 1, text: '' })
      }
      after = editSource(source, edits)
    }
    else {
      const start = item.start.find(part => part.type === 'seq-item-ind')!.offset
      const text = config ? stringify([entry(path, config)]).replaceAll('\n', eol) : root.items.length === 1 ? `[]${eol}` : ''
      after = editSource(source, [{ start, end: node.range![2], text: note + text }])
    }
  }
  else if (config && root?.flow) {
    const start = (root.srcToken as CST.FlowCollection).start.offset + 1
    after = editSource(source, [{ start, end: start, text: `${JSON.stringify(entry(path, config))}${root.items.length ? ',' : ''}` }])
  }
  else if (config) {
    const start = root?.range?.[1] ?? doc.contents?.range?.[0] ?? doc.range?.[1] ?? source.length
    after = editSource(source, [{ start, end: start, text: `${start && source[start - 1] !== '\n' ? eol : ''}${stringify([entry(path, config)]).replaceAll('\n', eol)}` }])
  }
  else {
    return source
  }
  if (JSON.stringify(inspectProjectBridge(after, path)) !== JSON.stringify(config))
    throw new Error('Could not safely edit the DeepSeek project bridge')
  return after
}

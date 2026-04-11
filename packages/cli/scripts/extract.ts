import type { ChangelogEntry, ComponentMeta, CssVarMeta, DemoMeta, EventMeta, MetadataFile, PropMeta, SlotMeta, VersionsFile } from '../src/types'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'

interface CliArgs {
  wotDir?: string
  output?: string
}

interface HeadingMatch {
  title: string
  body: string
}

const COMPONENT_MAP: Record<string, string[]> = {
  'table': ['wd-table', 'wd-table-column'],
  'radio': ['wd-radio', 'wd-radio-group'],
  'checkbox': ['wd-checkbox', 'wd-checkbox-group'],
  'collapse': ['wd-collapse', 'wd-collapse-item'],
  'swipe-action': ['wd-swipe-action', 'wd-swipe-action-item'],
  'grid': ['wd-grid', 'wd-grid-item'],
  'tabs': ['wd-tabs', 'wd-tab'],
  'steps': ['wd-steps', 'wd-step'],
  'sidebar': ['wd-sidebar', 'wd-sidebar-item'],
  'index-bar': ['wd-index-bar', 'wd-index-anchor'],
  'form': ['wd-form', 'wd-form-item'],
}

function logStep(icon: string, message: string): void {
  console.log(`${icon} [extract] ${message}`)
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]
    if (current === '--wot-dir')
      args.wotDir = next
    if (current === '--output')
      args.output = next
  }
  return args
}

function findSection(markdown: string, heading: string): HeadingMatch | null {
  const sections = markdown.split(/^##\s+/m).slice(1)
  for (const section of sections) {
    const [rawTitle = '', ...rest] = section.split('\n')
    const title = rawTitle.trim()
    if (title === heading || title.endsWith(` ${heading}`)) {
      return {
        title,
        body: rest.join('\n').trim(),
      }
    }
  }
  return null
}

function splitMarkdownRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed
    .split(/(?<!\\)\|/)
    .map(cell => cell.replace(/\\\|/g, '|').trim())
}

function parseMarkdownTable(section: string): string[][] {
  const lines = section.split('\n').map(line => line.trim())
  const tableStart = lines.findIndex(line => line.startsWith('|') && line.endsWith('|'))
  if (tableStart === -1)
    return []

  const tableLines: string[] = []
  for (let index = tableStart; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.startsWith('|') || !line.endsWith('|'))
      break
    tableLines.push(line)
  }

  if (tableLines.length < 2)
    return []

  return tableLines
    .slice(2)
    .map(splitMarkdownRow)
    .filter(row => row.some(Boolean))
}

function parseProps(section: string): PropMeta[] {
  return parseMarkdownTable(section).map(([name, description, type, defaultValue]) => ({
    name,
    description,
    type: type || 'unknown',
    default: defaultValue || undefined,
  }))
}

function parseEvents(section: string): EventMeta[] {
  return parseMarkdownTable(section).map(([name, description, payload]) => ({
    name,
    description,
    payload: payload || undefined,
  }))
}

function parseSlots(section: string): SlotMeta[] {
  return parseMarkdownTable(section).map(([name, description]) => ({
    name,
    description,
  }))
}

function parseCssVars(section: string): CssVarMeta[] {
  return parseMarkdownTable(section).map(([name, defaultValue, description]) => ({
    name,
    defaultValue: defaultValue || undefined,
    token: undefined,
    description: description || '',
  }))
}

function parseScssVariables(scssContent: string): CssVarMeta[] {
  const variables: CssVarMeta[] = []
  const lines = scssContent.split('\n')
  let pendingDescription = '-'

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line.startsWith('//')) {
      pendingDescription = line.replace(/^\/\/\s*/, '').trim() || '-'
      continue
    }

    const varIndex = line.indexOf('var(--wot-')
    if (varIndex === -1)
      continue

    const valueStart = varIndex + 'var(--wot-'.length
    const commaIndex = line.indexOf(',', valueStart)
    const closeIndex = line.lastIndexOf(')')
    if (commaIndex === -1 || closeIndex === -1 || commaIndex >= closeIndex)
      continue

    const cssVarName = line.slice(valueStart, commaIndex).trim()
    const defaultValue = line.slice(commaIndex + 1, closeIndex).replace(/!default\s*$/, '').trim()
    if (!cssVarName || !defaultValue)
      continue

    variables.push({
      name: `--wot-${cssVarName}`,
      defaultValue,
      description: pendingDescription,
    })

    pendingDescription = '-'
  }

  return variables
}

function extractCssVarsFromScss(wotDir: string, componentDocPath: string): CssVarMeta[] {
  const componentId = basename(componentDocPath, '.md')
  const targetComponents = COMPONENT_MAP[componentId] || [`wd-${componentId}`]
  const variables: CssVarMeta[] = []

  for (const componentName of targetComponents) {
    const scssPath = join(wotDir, 'src', 'uni_modules', 'wot-ui', 'components', componentName, 'index.scss')
    if (!existsSync(scssPath))
      continue

    const scssContent = readFileSync(scssPath, 'utf8')
    variables.push(...parseScssVariables(scssContent))
  }

  return variables
}

function parseDemos(markdown: string): DemoMeta[] {
  // eslint-disable-next-line regexp/no-super-linear-backtracking
  const demoPattern = /###\s+([^\n]+)[\s\S]*?```(?:html|vue)?\n([\s\S]*?)```/g
  const demos: DemoMeta[] = []
  let demoIndex = 0
  for (const match of markdown.matchAll(demoPattern)) {
    const title = match[1]?.trim()
    const code = match[2]?.trim()
    if (!title || !code)
      continue
    demoIndex += 1
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    demos.push({
      name: slug || `demo-${demoIndex}`,
      title,
      description: title,
      code,
    })
  }
  return demos
}

function extractDescription(markdown: string): string {
  const lines = markdown.split('\n')
  const titleIndex = lines.findIndex(line => line.startsWith('# '))
  for (let index = titleIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim()
    if (line)
      return line
  }
  return ''
}

function inferTag(filePath: string): string {
  const fileName = basename(filePath, '.md')
  return `wd-${fileName}`
}

function parseComponentMarkdown(filePath: string, wotDir: string): ComponentMeta {
  const markdown = readFileSync(filePath, 'utf8')
  const titleLine = markdown.split('\n').find(line => line.startsWith('# '))?.replace(/^#\s+/, '') ?? basename(filePath, '.md')
  const [name, nameZh = ''] = titleLine.split(/\s+/)
  const descriptionZh = extractDescription(markdown)
  const propsSection = findSection(markdown, 'Attributes')
  const eventsSection = findSection(markdown, 'Events')
  const slotsSection = findSection(markdown, 'Slots')
  const cssVarsSection = findSection(markdown, 'CSS 变量')
  const cssVars = extractCssVarsFromScss(wotDir, filePath)

  return {
    name,
    nameZh,
    tag: inferTag(filePath),
    category: '未分类',
    description: descriptionZh,
    descriptionZh,
    since: '2.0.0-alpha.5',
    doc: markdown,
    props: parseProps(propsSection?.body ?? ''),
    events: parseEvents(eventsSection?.body ?? ''),
    slots: parseSlots(slotsSection?.body ?? ''),
    cssVars: cssVars.length ? cssVars : parseCssVars(cssVarsSection?.body ?? ''),
    demos: parseDemos(markdown),
  }
}

function parseChangelog(filePath: string): ChangelogEntry[] {
  if (!existsSync(filePath))
    return []

  const markdown = readFileSync(filePath, 'utf8')
  const entries: ChangelogEntry[] = []
  const blocks = markdown.trim().split(/^##\s+/m).filter(Boolean)
  for (const block of blocks) {
    const [header, ...rest] = block.split('\n')
    const body = rest.join('\n')
    const version = header.trim().split(/\s+/)[0]
    const highlights = body.split('\n').filter(line => line.trim().startsWith('- ')).map(line => line.trim().slice(2))
    entries.push({
      version,
      summary: highlights[0] ?? header.trim(),
      highlights,
    })
  }
  return entries
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  if (!args.wotDir || !args.output)
    throw new Error('Usage: tsx scripts/extract.ts --wot-dir <path-to-wot-ui> --output <path-to-v2.json>')

  const wotDir = resolve(args.wotDir)
  const outputFile = resolve(args.output)
  const docsDir = join(wotDir, 'docs', 'component')
  const changelogPath = join(wotDir, 'docs', 'guide', 'changelog.md')

  logStep('🚀', `source: ${wotDir}`)
  logStep('📦', `output: ${outputFile}`)

  if (!existsSync(docsDir))
    throw new Error(`Component docs directory not found: ${docsDir}`)

  const componentFiles = readdirSync(docsDir).filter(file => file.endsWith('.md'))
  logStep('📚', `found ${componentFiles.length} component docs in ${docsDir}`)

  const components = componentFiles
    .map(file => parseComponentMarkdown(join(docsDir, file), wotDir))
    .filter(component => component.name && component.tag)
    .sort((left, right) => left.name.localeCompare(right.name))

  const changelog = parseChangelog(changelogPath)
  logStep('🧩', `parsed ${components.length} components and ${changelog.length} changelog entries`)

  const metadata: MetadataFile = {
    version: '2.0.0-alpha.5',
    generatedAt: new Date().toISOString(),
    components,
    changelog,
  }

  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, `${JSON.stringify(metadata, null, 2)}\n`)

  const versions: VersionsFile = {
    latest: metadata.version,
    supported: [metadata.version],
    aliases: {
      v2: metadata.version,
      latest: metadata.version,
    },
  }

  const versionsPath = join(dirname(outputFile), 'versions.json')
  writeFileSync(versionsPath, `${JSON.stringify(versions, null, 2)}\n`)

  logStep('✅', `wrote metadata to ${outputFile}`)
  logStep('📝', `wrote versions to ${versionsPath}`)
}

main()

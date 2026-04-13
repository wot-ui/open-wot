export interface PropMeta {
  name: string
  type: string
  default?: string
  description: string
  since?: string
  deprecated?: boolean
  replacement?: string
}

export interface EventMeta {
  name: string
  payload?: string
  description: string
}

export interface SlotMeta {
  name: string
  description: string
}

export interface CssVarMeta {
  name: string
  defaultValue?: string
  token?: string
  description: string
}

export interface DemoMeta {
  name: string
  title: string
  description: string
  code: string
}

export interface ChangelogEntry {
  version: string
  date?: string
  summary: string
  highlights: string[]
  components?: string[]
}

export interface ComponentMeta {
  name: string
  nameZh: string
  tag: string
  category: string
  description: string
  descriptionZh: string
  since: string
  doc?: string
  props: PropMeta[]
  events: EventMeta[]
  slots: SlotMeta[]
  cssVars: CssVarMeta[]
  demos?: DemoMeta[]
}

export interface MetadataFile {
  version: string
  generatedAt: string
  components: ComponentMeta[]
  changelog?: ChangelogEntry[]
}

export interface VersionsFile {
  latest: string
  supported: string[]
  aliases: Record<string, string>
}

export type OutputFormat = 'json' | 'markdown' | 'text'

export interface QueryOptions {
  format: OutputFormat
  version?: string
}

export interface UsageEntry {
  name: string
  tag: string
  count: number
  files: string[]
}

export interface UsageReport {
  scannedFiles: number
  components: UsageEntry[]
  imports: string[]
}

export interface LintIssue {
  file: string
  line: number
  rule: string
  severity: 'warning' | 'error'
  message: string
}

export interface LintReport {
  scannedFiles: number
  issues: LintIssue[]
}

export interface DoctorCheck {
  name: string
  status: 'pass' | 'warn' | 'fail'
  severity?: 'warning' | 'error'
  message: string
  suggestion?: string
}

export interface DoctorReport {
  dir: string
  checks: DoctorCheck[]
}

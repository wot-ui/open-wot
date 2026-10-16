import type { DetectContext } from './types'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function desktopPaths(context: DetectContext): string[] {
  if (context.platform === 'darwin')
    return [join(context.homeDir, 'Applications/DeepSeek Harness.app'), '/Applications/DeepSeek Harness.app']
  if (context.platform === 'win32')
    return [join(context.env?.LOCALAPPDATA ?? context.homeDir, 'Programs/DeepSeek Harness/DeepSeek Harness.exe')]
  return [join(context.homeDir, '.local/share/deepseek-harness'), '/opt/DeepSeek Harness/deepseek-harness']
}
export async function detectDesktop(context: DetectContext): Promise<boolean> {
  return (await Promise.all(desktopPaths(context).map(path => access(path).then(() => true).catch(() => false)))).some(Boolean)
}
export async function desktopCompatibilityProblem(context: DetectContext): Promise<string | undefined> {
  if (context.platform !== 'darwin')
    return undefined
  for (const path of desktopPaths(context)) {
    const plist = await readFile(join(path, 'Contents/Info.plist'), 'utf8').catch(() => undefined)
    if (!plist)
      continue
    const version = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1]
    const match = version?.match(/^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/)
    if (match && Number(match[1]) === 0 && (Number(match[2]) < 2 || (Number(match[2]) === 2 && Number(match[3]) === 0 && match[4] !== undefined && Number(match[4]) < 2)))
      return 'DeepSeek project bridge requires desktop 0.2.0-rc.2 or newer; upgrade before using project scope'
    return undefined
  }
}

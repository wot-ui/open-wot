import type { DetectContext } from './types'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { extname, join } from 'node:path'
import process from 'node:process'

async function isExecutable(path: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    await access(path, platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  }
  catch {
    return false
  }
}

export async function findExecutable(names: string[], context: DetectContext): Promise<string | undefined> {
  const env = context.env ?? process.env
  const platform = context.platform ?? process.platform
  const pathEntries = (env.PATH ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean)
  const pathExts = platform === 'win32'
    ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : ['']

  for (const name of names) {
    const extensions = platform === 'win32' && !extname(name) ? pathExts : ['']
    for (const directory of pathEntries) {
      for (const extension of extensions) {
        const candidate = join(directory, `${name}${extension}`)
        if (await isExecutable(candidate, platform))
          return candidate
      }
    }
  }
  return undefined
}

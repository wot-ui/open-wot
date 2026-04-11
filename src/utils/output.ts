import process from 'node:process'

export function writeStdout(message: string): void {
  process.stdout.write(message)
}

export function writeLine(message = ''): void {
  writeStdout(`${message}\n`)
}

export function writeJson(value: unknown): void {
  writeLine(JSON.stringify(value, null, 2))
}

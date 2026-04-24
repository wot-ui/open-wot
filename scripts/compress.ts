import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

const files = readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.endsWith('.json.gz'))

if (files.length === 0) {
  process.stdout.write('No JSON files found in data/\n')
  process.exit(0)
}

for (const file of files) {
  const srcPath = join(dataDir, file)
  const destPath = join(dataDir, `${file}.gz`)
  const input = readFileSync(srcPath)
  const compressed = gzipSync(input, { level: 9 })
  writeFileSync(destPath, compressed)
  const ratio = ((1 - compressed.length / input.length) * 100).toFixed(1)
  process.stdout.write(`  ${file} → ${file}.gz  (${(input.length / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB, -${ratio}%)\n`)
}

process.stdout.write(`\n✅ Compressed ${files.length} file(s)\n`)

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [fileURLToPath(new URL('./src/index.ts', import.meta.url))],
  clean: true,
  dts: true,
  format: ['esm'],
  platform: 'node',
  target: 'node20',
})

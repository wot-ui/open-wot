import { describe, expect, it } from 'vitest'
import {
  formatCommand,
  formatLogMessage,
  formatStatusLabel,
  formatUpdateNotice,
  supportsColor,
} from '../../src/utils/terminal'

describe('terminal formatting', () => {
  it('keeps output plain when color is not supported', () => {
    expect(supportsColor({ env: {}, isTty: false })).toBe(false)
    expect(formatLogMessage('warn', 'Check failed', { env: {}, isTty: false })).toBe('[wot] Check failed')
    expect(formatStatusLabel('warning', { env: {}, isTty: false })).toBe('WARNING')
    expect(formatCommand('npm install -g @wot-ui/cli', { env: {}, isTty: false })).toBe('npm install -g @wot-ui/cli')
  })

  it('uses ansi colors only for color-capable terminals', () => {
    expect(supportsColor({ env: {}, isTty: true })).toBe(true)
    expect(supportsColor({ env: { NO_COLOR: '1' }, isTty: true })).toBe(false)
    expect(supportsColor({ env: { TERM: 'dumb' }, isTty: true })).toBe(false)
    expect(formatStatusLabel('pass', { env: {}, isTty: true })).toContain('\x1B[32m')
  })

  it('formats update notices as a compact multi-line block', () => {
    const output = formatUpdateNotice({
      cached: false,
      checkedAt: 1000,
      command: 'npm install -g @wot-ui/cli',
      currentVersion: '1.0.1',
      disabled: false,
      latestVersion: '1.0.2',
      packageName: '@wot-ui/cli',
      updateAvailable: true,
    }, { env: {}, isTty: false })

    expect(output).toBe([
      '[wot] Update available',
      '[wot] @wot-ui/cli  1.0.1 -> 1.0.2',
      '[wot] Run: npm install -g @wot-ui/cli',
    ].join('\n'))
  })
})

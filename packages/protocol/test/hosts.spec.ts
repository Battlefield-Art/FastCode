import { describe, expect, it } from 'vitest'
import { HOST_PROFILES, shownBytes, shownTokens } from '../src/index.ts'

describe('shownTokens', () => {
  it('counts an original up to what the host shows its model at once', () => {
    expect(shownTokens('claude', { bytes: 120_000, tokens: 30_000 })).toBe(7500)
    expect(shownTokens('claude', { bytes: 30_000, tokens: 7600 })).toBe(7600)
    expect(shownBytes('claude', { bytes: 120_000 })).toBe(30_000)
    expect(shownBytes('claude', { bytes: 1000 })).toBe(1000)
  })
  it('counts it whole where the host sets no limit, or is unknown', () => {
    expect(shownTokens('pi', { bytes: 120_000, tokens: 30_000 })).toBe(30_000)
    expect(shownTokens('shell', { bytes: 120_000, tokens: 30_000 })).toBe(30_000)
    expect(shownTokens('someone-else', { bytes: 120_000, tokens: 30_000 })).toBe(30_000)
    expect(shownTokens(undefined, { bytes: 120_000, tokens: 30_000 })).toBe(30_000)
  })
  it('sets a limit on every host that hands TokenWise output before cutting it', () => {
    for (const host of ['claude', 'codex', 'codebuddy', 'hermes', 'dsh', 'grok', 'copilot']) {
      expect((HOST_PROFILES[host]?.inlineChars ?? HOST_PROFILES[host]?.inlineBytes)!, host).toBeGreaterThan(0)
    }
  })
  it('counts in the unit the host counts in', () => {
    // 15,000 CJK characters are 45,000 bytes: Claude Code (characters) shows them all, Codex (bytes, 40,000) does not.
    const cjk = { bytes: 45_000, chars: 15_000, tokens: 15_000 }
    expect(shownTokens('claude', cjk)).toBe(15_000)
    expect(shownTokens('codex', cjk)).toBe(13_333)
    // An older record without its characters counts by bytes: never more than it should.
    expect(shownTokens('claude', { bytes: 45_000, tokens: 15_000 })).toBe(10_000)
  })
})

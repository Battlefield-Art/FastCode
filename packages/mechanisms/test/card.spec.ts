import { describe, expect, it } from 'vitest'
import { savedCard } from '../src/index.ts'

const plain = (text: string) => text.replace(/\x1b\[[0-9;]*m/gu, '')
const saved = { savedTokens: 2402, seenTokens: 3080 }

describe('the card that says what a conversation saved', () => {
  it('draws a small jar beside the tokens saved and a bar for how much shorter the output got, in English', () => {
    expect(savedCard(saved, { lines: true })).toBe([
      ' ▗▄▄▖',
      '▗▛●░▜▖ TokenWise · saved 2,402 tokens in this conversation',
      '▐●●●●▌ ▰▰▰▰▰▰▰▰▱▱ tool output 78% shorter',
    ].join('\n'))
    // The jar fills with the share: a little saved is still one coin.
    expect(savedCard({ savedTokens: 12, seenTokens: 5000 }, { lines: true })).toBe([
      ' ▗▄▄▖',
      '▗▛░░▜▖ TokenWise · saved 12 tokens in this conversation',
      '▐●···▌ ▱▱▱▱▱▱▱▱▱▱ tool output under 1% shorter',
    ].join('\n'))
  })

  it('fits each agent: colour, a title of its own, a label before the first line, a lid that survives trimming, or one line', () => {
    const coloured = savedCard(saved, { lines: true, color: true })!
    expect(coloured).toContain('\x1b[38;2;79;227;193m')
    expect(plain(coloured)).toBe(savedCard(saved, { lines: true }))
    expect(savedCard(saved, { lines: true, untitled: true })!.split('\n')[1]).toBe('▗▛●░▜▖ saved 2,402 tokens in this conversation')
    expect(savedCard(saved, { lines: true, breakFirst: true })!.startsWith('\n ▗▄▄▖\n')).toBe(true)
    // Grok trims a message's leading whitespace: a braille blank keeps the lid over the jar.
    expect(savedCard(saved, { lines: true, trimmed: true })!.trim().split('\n')[0]).toBe('\u2800▗▄▄▖')
    expect(savedCard(saved)).toBe('TokenWise · saved 2,402 tokens in this conversation ▰▰▰▰▰▰▰▰▱▱ tool output 78% shorter')
  })

  it('fills as pi plays it: from nothing to the number, never past it', () => {
    const frame = (progress: number) => savedCard(saved, { lines: true, progress })!.split('\n')
    expect(frame(0).slice(1)).toEqual(['▗▛░░▜▖ TokenWise · saved 0 tokens in this conversation', '▐····▌ ▱▱▱▱▱▱▱▱▱▱ tool output 78% shorter'])
    const counts = [0, 0.2, 0.4, 0.6, 0.8, 1].map(p => Number(/saved ([\d,]+)/u.exec(frame(p)[1]!)![1]!.replace(/,/gu, '')))
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
    expect(counts.at(-1)).toBe(2402)
    expect(frame(2)).toEqual(frame(1))
  })

  it('says what learned rules saved, and once what TokenWise just learned', () => {
    const learned = { ...saved, learnedTokens: 1830 }
    expect(savedCard(learned, { lines: true })!.split('\n')[2]).toBe('▐●●●●▌ ▰▰▰▰▰▰▰▰▱▱ tool output 78% shorter · 1,830 from learned rules')
    const news = 'output from python3 etl.py is now shorter for every agent (/tokenwise to see or undo)'
    expect(savedCard(learned, { lines: true }, news)).toBe([
      ' ▗▄▄▖',
      '▗▛●░▜▖ TokenWise · saved 2,402 tokens in this conversation',
      '▐●●●●▌ ▰▰▰▰▰▰▰▰▱▱ tool output 78% shorter · 1,830 from learned rules',
      '       ✦ Just learned: output from python3 etl.py is now shorter for every agent (/tokenwise to see or undo)',
    ].join('\n'))
    expect(savedCard(saved, {}, news)).toBe('TokenWise · saved 2,402 tokens in this conversation ▰▰▰▰▰▰▰▰▱▱ tool output 78% shorter'
      + ' · ✦ Just learned: output from python3 etl.py is now shorter for every agent (/tokenwise to see or undo)')
    // Nothing saved (or nothing more): the news alone.
    expect(savedCard(undefined, { lines: true, breakFirst: true }, news)).toBe(`\nTokenWise ✦ Just learned: ${news}`)
    expect(savedCard({ savedTokens: 0, seenTokens: 10 }, { lines: true, untitled: true }, news)).toBe(`✦ Just learned: ${news}`)
    expect(plain(savedCard(learned, { lines: true, color: true }, news)!)).toBe(savedCard(learned, { lines: true }, news))
    // pi's fill counts the learned part up too, never past the whole.
    expect(savedCard(learned, { lines: true, progress: 0 })!.split('\n')[2]).toContain('· 0 from learned rules')
  })

  it('says nothing for a conversation that saved nothing', () => {
    expect(savedCard({ savedTokens: 0, seenTokens: 400 }, { lines: true })).toBeUndefined()
    expect(savedCard({ savedTokens: -50, seenTokens: 400 })).toBeUndefined()
  })
})

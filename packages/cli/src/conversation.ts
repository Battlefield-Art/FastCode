/**
 * `tokenwise notice <host> --session ID`: what TokenWise saved in one
 * conversation, for the end of a turn. Said only when the number grew since it
 * was last said (@tokenwise/mechanisms keeps that number on disk), so a turn
 * that saved nothing shows nothing.
 */
import { adoptionNews, markSavingsTold, savedCard, takeSwitchedOff, untoldSavings } from '@tokenwise/mechanisms'
import type { CardStyle } from '@tokenwise/mechanisms'
import { cliContext } from './context.ts'
import { learnedNews, switchedOffNews } from './learn.ts'

/**
 * How each agent shows the card (@tokenwise/mechanisms savedCard), as seen in each one's real terminal UI
 * (2026-11-19). All six keep the lines. Claude Code, Codex, CodeBuddy and Hermes show the colour; Copilot drops
 * it and Grok prints the escape codes as text, so those two get none; Grok also trims the card's leading space. Claude Code ("Stop says:") and Codex
 * ("↳ Hook ·") put a label before the first line, so the card starts below it.
 */
export const CARD_STYLE: Readonly<Record<string, CardStyle>> = {
  claude: { lines: true, breakFirst: true, color: true },
  codex: { lines: true, breakFirst: true, color: true },
  codebuddy: { lines: true, color: true },
  grok: { lines: true, trimmed: true },
  copilot: { lines: true },
  hermes: { lines: true, color: true },
}

/**
 * The card to show at the end of this turn, or undefined: nothing saved yet,
 * nothing more since it was last said, or TokenWise switched off. Once after a
 * learning run adopted rules, it also says what TokenWise just learned (on its
 * own when nothing more was saved), so the person hears it at the end of the
 * turn rather than at the agent's next start. With `peek` it is left to be
 * said again (a plugin marks it told once shown, with `told`).
 */
export function conversationNotice(host: string, sessionId: string | undefined, env: NodeJS.ProcessEnv = process.env,
  options: { peek?: boolean; told?: boolean } = {}): string | undefined {
  if (!sessionId || env.TOKENWISE_DISABLE === '1') return undefined
  const context = cliContext({ env })
  const savings = untoldSavings(id => context.readJournal({ host, sessionId: id }), context.dataDirs, host, sessionId)
  const writable = options.peek ? undefined : context.writable()
  // Peeked first: only a card that is shown (or marked told) uses it up.
  const news = adoptionNews(context.dataDir, host, true)
  // Else a learned rule the monitor switched off since: one row a turn, the other waits for the next card.
  const off = news ? [] : takeSwitchedOff(context.dataDir, host, true)
  const row = news ? learnedNews(host, news) : off.length ? { label: 'Switched off:', text: switchedOffNews(host, off) } : undefined
  const style = CARD_STYLE[host] ?? {}
  const line = savedCard(savings, env.NO_COLOR ? { ...style, color: false } : style, row)
  if (!line) return undefined
  if (writable && savings) markSavingsTold(writable.dataDir, host, sessionId, savings.savedTokens)
  if (writable && news) adoptionNews(writable.dataDir, host)
  if (writable && off.length) takeSwitchedOff(writable.dataDir, host)
  return options.told ? undefined : line
}

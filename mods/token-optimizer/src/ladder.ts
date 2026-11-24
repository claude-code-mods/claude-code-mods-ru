// The sentence ladder: the single most urgent thing to say, and
// at most one button. Pure.
import type { Limit, Mood, Snapshot } from './contracts.ts'
import type { IconName } from './icons.ts'
import { DASHBOARD_OPENING } from './actions.ts'
import { clock, gradeOf, renewalPhrase, tokens, type FormatOptions } from './format.ts'

export type Tone = 'good' | 'caution' | 'bad' | 'cold'

/** A run of text. Text is full ink; only `lose` (bold red) carries colour. `strong` is bold ink. */
export type Run = { text: string; lose?: true; strong?: true }

export type ActionId = 'clean' | 'clean-first' | 'fresh' | 'warm'
export type Action = { id: ActionId; label: string }

export type Sentence = { icon: IconName; tone: Tone; runs: Run[]; action: Action | null }

/** Quality below grade B (score under 70) is worth a sentence. */
export const QUALITY_FLOOR = 70
export const LIMIT_WARN = 90

const say = (icon: IconName, tone: Tone, runs: Run[], action: Action | null = null): Sentence => ({ icon, tone, runs, action })
const plain = (text: string): Run => ({ text })

/** The tokens the next message would re-read, as the one bold red run. */
export function loseRun(n: number): Run {
  return { text: `${tokens(n)} tokens`, lose: true }
}

function renews(limit: Limit, now: number, opts: FormatOptions): string {
  const when = renewalPhrase(limit.resetsAt, now, opts)
  return when ? ` Обновляет ${when}.` : ''
}

function limitSentence(name: string, limit: Limit, now: number, opts: FormatOptions): Sentence {
  const head = limit.percentUsed >= 100 ? `${name} limit reached.` : `${name} limit ${Math.round(limit.percentUsed)}% used.`
  return say('gauge', 'bad', [plain(head + renews(limit, now, opts))])
}

export function sentence(s: Snapshot, opts: FormatOptions = {}): Sentence {
  // What the band is doing right now leads, with no button.
  if (s.busy === 'clean') return say('compact', 'good', [plain('Выполняется очистка.')])
  if (s.busy === 'fresh-capture') return say('bookmark', 'good', [plain('Сохранение контрольной точки.')])
  if (s.busy === 'fresh-clear') return say('bookmark', 'good', [plain('Clearing.')])
  if (s.busy === 'dashboard') return say('gauge', 'good', [plain(DASHBOARD_OPENING)])
  if (s.busy === 'warming') return say('hourglass', 'good', [plain('Поддержание кэша в активном состоянии.')])
  if (s.freshArmed) {
    return say('bookmark', 'caution', [plain('Начать заново clears this conversation after saving a checkpoint.')], {
      id: 'fresh',
      label: 'Нажмите еще раз, чтобы очистить',
    })
  }
  if (s.handoffPending) return say('bookmark', 'good', [plain('Контрольная точка готова, она присоединяется к вашему первому сообщению.')])

  // The ladder, first match wins. Null limits (API users) skip their rules.
  const five = s.fiveHour
  const week = s.week
  if (five && five.percentUsed >= 100) return limitSentence('5-hour', five, s.now, opts)
  if (week && week.percentUsed >= 100) return limitSentence('Weekly', week, s.now, opts)
  if (five && five.percentUsed >= LIMIT_WARN) return limitSentence('5-hour', five, s.now, opts)
  if (week && week.percentUsed >= LIMIT_WARN) return limitSentence('Weekly', week, s.now, opts)

  const q = s.quality
  // Recovery thresholds remain shadow-only, including older cached flags.
  if (q && q.score < QUALITY_FLOOR) {
    return say('slip', 'bad', [plain(`Качество снизилось до ${gradeOf(q.score)}.`)], { id: 'clean', label: 'Очистить' })
  }

  // Cache rules hold still while a turn runs: every request refreshes the cache.
  if (!s.working) {
    const c = s.cache
    if (c.state === 'cold') {
      const runs: Run[] =
        c.tokensAtStake != null
          ? [plain('Кэш холодный. Следующее сообщение будет считано повторно '), loseRun(c.tokensAtStake), plain(' по полной цене.')]
          : [plain('Кэш холодный. Следующее сообщение будет считано повторно the whole context по полной цене.')]
      runs.push(plain(' Если сначала выполнить очистку, последующие сообщения будут стоить дешевле.'))
      return say('cold', 'cold', runs, { id: 'clean-first', label: 'Очистить first' })
    }
    if (c.state === 'warning') {
      const head = c.secondsLeft != null ? `Кэш сбрасывается в ${clock(c.secondsLeft)}.` : 'Кэш скоро будет сброшен.'
      const runs: Run[] =
        c.tokensAtStake != null
          ? [plain(`${head} Затем следующее сообщение снова читается `), loseRun(c.tokensAtStake), plain('.')]
          : [plain(`${head} Затем следующее сообщение снова читается the whole context.`)]
      // Сохранить в горячем списке only on a measured lifetime.
      return say('hourglass', 'caution', runs, c.measured ? { id: 'warm', label: 'Сохранить в горячем списке' } : null)
    }
  }

  const observing = q && q.compactions > 0 ? `Сжатие: ${q.compactions} (наблюдение).` : 'Все чисто.'
  return say('check', 'good', [plain(s.note ?? observing)])
}

/** How healthy the session looks, for Clawd's face. */
export function moodOf(s: Snapshot): Mood {
  const limits = [s.fiveHour, s.week].filter((l): l is Limit => l !== null)
  const q = s.quality
  if (limits.some((l) => l.percentUsed >= LIMIT_WARN)) return 'panic'
  if (q && q.score < QUALITY_FLOOR) return 'worried'
  if (!s.working && (s.cache.state === 'cold' || s.cache.state === 'warning')) return 'worried'
  return 'calm'
}

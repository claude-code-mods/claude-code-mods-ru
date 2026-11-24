// What the band, `/agentctl` and `/agentctl policy|events` say (requirements FR-2, FR-3, FR-17,
// FR-23; tech spec § 3.3). Pure: every input arrives as data, every line names its source and age,
// and a field whose source did not answer says so instead of showing a value.

import { checkLine } from './firstrun.js'
import { digest } from './fingerprint.js'
import { sanitize } from './sanitize.js'

// The opaque key evidence for a declared check is stored under: arguments never become a stored
// identifier in plaintext.
export function checkKey(argv) {
  return 'check-' + digest(argv.join('\u0000'))
}

// Evidence counts as current only when the check reported no error, the tree did not change during
// the run, the run's reading matches the last one, and no reading was partial.
export function evidenceCurrent(ev, fingerprint) {
  if (!fingerprint || !ev || ev.outcome !== 'ok' || !ev.before || !ev.after) return false
  if (ev.before.value !== ev.after.value || ev.after.value !== fingerprint.value) return false
  return ![ev.coverage, ev.before.coverage, ev.after.coverage, fingerprint.coverage].includes('partial')
}

// Where the task's declared checks stand on the current tree: how many there are, how many have run
// at all, and which are not current (never run, failed, or stale).
export function checkProgress(task, evidence, fingerprint) {
  const rows = (task?.executors ?? []).filter((e) => e.check).map((e) => {
    const ev = evidence?.[checkKey(e.argv)]
    // Never shortened: the line is one Claude runs, and a cut command would not match the check.
    return { argv: sanitize(checkLine(e.argv), Infinity), ran: Boolean(ev), current: evidenceCurrent(ev, fingerprint) }
  })
  return { declared: rows.length, ran: rows.filter((r) => r.ran).length, pending: rows.filter((r) => !r.current).map((r) => r.argv) }
}

// The four states a field can be in (FR-3).
export function field(label, reading, now) {
  if (!reading) return `${label}: нет данных`
  if (reading.failed) return `${label}: недоступно (${reading.failed})`
  const age = Math.max(0, Math.round((now - reading.at) / 1000))
  const stale = reading.staleAfterMs !== undefined && now - reading.at > reading.staleAfterMs
  return `${label}: ${reading.value} — ${reading.source}, ${age} с назад${stale ? ' (устарело)' : ''}`
}

// review-state.js check --format=json → a gate reading. A gate pass is a gate pass, never a test pass.
export function gateReading(run, at) {
  if (typeof run === 'string') return { failed: run, at }
  if (!run || run.exitCode !== 0) return { failed: `проверка завершилась ${run ? run.exitCode : 'без результата'}`, at }
  let s
  try { s = JSON.parse(run.stdout) } catch { return { failed: 'не JSON', at } }
  const word = (p) => (!p ? '?' : p.passed ? '✅' : p.verdict === 'fail' && p.digest_match ? '⛔' : p.noted && !p.digest_match ? '⏳ устарело' : p.owed ? '⏳ ожидается' : '·')
  return { value: `код ${word(s.code_review)} · док ${word(s.doc_review)} · прекоммит ${word(s.precommit)}`, source: 'проверка review-state.js', at }
}

// Usage windows are read by kind; a missing window is missing, never 0%. One account's windows are
// shown for this session only and never summed with other sessions.
export function usageReading(usage, kind, at) {
  if (!usage) return null
  const w = (usage.rateLimits ?? []).find((r) => r.kind === kind)
  if (!w) return null
  return { value: `${Math.round(w.percentUsed)}%${w.resetsAt ? ` (сброс ${w.resetsAt})` : ''}`, source: `использование сессии (${w.source ?? 'хост'})`, at }
}

export function contextReading(usage, at) {
  const p = usage?.context?.percent
  return typeof p === 'number' ? { value: `${Math.round(p)}%`, source: 'использование сессии', at } : null
}

function evidenceLines(evidence, currentFingerprint, now) {
  const out = []
  for (const ev of Object.values(evidence ?? {})) {
    const fresh = currentFingerprint && ev.after && ev.after.value === currentFingerprint.value && ev.before && ev.before.value === ev.after.value
    const state = ev.outcome === 'backgrounded' ? 'запущено, завершение не наблюдалось'
      : ev.outcome === 'refused' ? 'refused'
      : !ev.after || !ev.before ? 'доказательства недоступны'
      : ev.before.value !== ev.after.value ? 'дерево изменилось во время выполнения — не привязано'
      : fresh && [ev.coverage, ev.before.coverage, ev.after.coverage, currentFingerprint.coverage].includes('partial') ? 'совпадает, но одно чтение было неполным'
      : fresh ? 'current'
      : 'устарело (дерево с тех пор изменилось)'
    const age = Math.max(0, Math.round((now - ev.at) / 1000))
    out.push(`  ${sanitize(ev.requested, 120)}: ${ev.outcome === 'ok' ? 'ошибок не сообщалось' : ev.outcome} · ${state} · ${ev.coverage ?? 'покрытие неизвестно'} · ${age}s ago`)
  }
  return out
}

const REASON_LABEL = {
  input: 'ожидает вашего ввода',
  permission: 'ожидает решения о разрешении',
  'policy-denied': 'запрещено политикой задачи',
  'rate-limit': 'достигнут лимит запросов',
  'suspected-stall': 'нет активности (останов не подтверждён)',
}

function interventionLines(state, now) {
  return Object.entries(state.interventions ?? {}).map(([reason, v]) => {
    const age = Math.max(0, Math.round((now - v.since) / 1000))
    const detail = typeof v.detail === 'string' ? sanitize(v.detail, 120) : v.detail?.resetsAt ? `сброс ${v.detail.resetsAt}` : ''
    return `  ${REASON_LABEL[reason] ?? reason}${detail ? ` — ${detail}` : ''} · ${age} с назад`
  })
}

// Compact by default — it reaches Claude — and the diagnostic lines on `/agentctl status --details`.
// Labels say what they measure (found in a first-run test: "Observation: ok" read as "work passed").
export function statusText(m, { details = false } = {}) {
  const { now, task, state } = m
  const lines = []
  lines.push(task ? `Задача: ${sanitize(task.goal, 120)} (${task.id})` : 'Задача: не привязана')
  const iv = interventionLines(state, now)
  lines.push(iv.length ? 'Требует внимания:' : 'Требует внимания: ничего не обнаружено')
  lines.push(...iv)
  lines.push(field('Проверки ревью', m.gate, now))
  const ev = evidenceLines(m.evidence, m.fingerprint, now)
  lines.push(ev.length ? 'Доказательства выполнения (не вердикт ревью):' : 'Доказательства выполнения: ни одна объявленная проверка не запускалась')
  lines.push(...ev)
  const bg = Object.entries(state.background ?? {}).filter(([, b]) => b.status === 'started' || b.status === 'in-flight')
  if (bg.length) lines.push(`Фоновых задач в процессе: ${bg.length} (${bg.map(([id]) => id).join(', ')})`)
  if (!details) {
    lines.push('Подробнее: /agentctl status --details · /agentctl help')
    return lines.join('\n')
  }
  lines.push(`Хранилище состояния: ${m.health === 'ok' ? 'исправно' : m.health}`)
  lines.push(`Runtime: ${state.runtime.value}${state.runtime.tool ? ` (${state.runtime.tool})` : ''} ${Math.max(0, Math.round((now - state.runtime.since) / 1000))} с назад · фаза ${state.phase.value} · результат ${state.result.value}`)
  // A usage reading arrives with Claude's first reply in the session; before that it is absent.
  const usage = (label, r) => (r ? field(label, r, now) : `${label}: нет данных (читается после первого ответа Клода)`)
  lines.push(usage('Контекст', m.context))
  lines.push(usage('Окно 5 ч', m.fiveHour))
  return lines.join('\n')
}

export function bandText(m) {
  const { task, state, now } = m
  const iv = Object.keys(state.interventions ?? {})
  const attention = iv.length ? `⚠ ${iv.map((r) => REASON_LABEL[r] ?? r).join(', ')}` : 'внимание не требуется'
  const head = task ? `agentctl · ${sanitize(task.goal, 40)}` : 'agentctl · задача не привязана'
  const rt = `${state.runtime.value}${state.runtime.tool ? `:${state.runtime.tool}` : ''} ${Math.max(0, Math.round((now - state.runtime.since) / 1000))}s`
  let gate = 'проверок нет'
  if (m.gate?.failed) gate = 'проверки недоступны'
  else if (m.gate) {
    const age = Math.max(0, Math.round((now - m.gate.at) / 1000))
    const stale = m.gate.staleAfterMs !== undefined && now - m.gate.at > m.gate.staleAfterMs
    gate = `${m.gate.value} (${age}s${stale ? ', stale' : ''})`
  }
  const resume = m.checkpoint ? ` · последняя передача ${new Date(m.checkpoint.savedAt).toISOString()}` : ''
  const proposal = m.pending ? ` · черновик ${m.pending.digest.slice(0, 8)} ожидает — /agentctl accept` : ''
  return `${head} · ${rt} · ${attention} · ${gate}${proposal}${resume}${m.health === 'ok' ? '' : ` · ${m.health}`}`
}

export const LIMITS = [
  'Этот мод — управление и отображение, а не граница изоляции; доступ к продакшну только на чтение обеспечивается учётными данными и правами самой цели.',
  'Если хост пропускает хук этого мода (падение воркера, мод отключён), здесь ничего не запрещается; держите опасные команды в правилах permissions.deny.',
  'Встроенные правила разрешений сопоставляют текст команды, а не программы; другой мод может изменить вердикт на tool.check.',
  'Разрешённые исполнители запускаются без классификации их действий.',
]

export function policyText(task) {
  if (!task) return ['Задача не привязана: встроенные классы записи в продакшн и записи в удалённый git по-прежнему запрещены; всё остальное передаётся собственной системе разрешений хоста.', ...LIMITS].join('\n')
  const one = (x) => (Array.isArray(x) ? x.join(' ') : Array.isArray(x?.argv) ? x.argv.join(' ') + (x.check ? ' (check)' : '') : String(x))
  const fmt = (xs) => (xs?.length ? xs.map((x) => sanitize(one(x), 200)).join('; ') : 'none')
  return [
    `Задача ${task.id} · версия политики ${task.policyVersion ?? 1}`,
    ...(task.recordMissing ? ['Запись привязанной задачи отсутствует: всё, кроме чтения внутри рабочего дерева, запрещено. Задайте задачу снова.'] : []),
    `Рабочее дерево: ${sanitize(task.worktree, 200)}`,
    `Правки: ${(task.allow ?? []).includes('edit') ? `разрешены в ${fmt(task.editRoots ?? ['.'])}` : 'не разрешены'}`,
    `Запрещено (задача): ${fmt(task.forbid)} · плюс встроенные классы записи в продакшн и записи в удалённый git`,
    `Разрешённые исполнители: ${fmt(task.executors)}`,
    `Требует человека: ${fmt(task.needsUser)}`,
    `Другие разрешённые инструменты: ${fmt(task.tools)}`,
    'Всё остальное передаётся собственной системе разрешений хоста (или авторежиму): мод это не классифицирует.',
    'По возможности: мод читает каждый вызов инструмента, но не содержимое скриптов и запускаемые ими команды.',
    ...LIMITS,
  ].join('\n')
}

export function eventsText(decisions, n, now) {
  const list = (decisions ?? []).slice(-n)
  if (!list.length) return 'В этой сессии решения не записаны.'
  return list.map((d) => `${Math.max(0, Math.round((now - d.at) / 1000))} с назад · ${d.outcome} · ${d.tool} · ${sanitize(d.requested, 160)} · ${sanitize(d.rule, 160)}`).join('\n')
}

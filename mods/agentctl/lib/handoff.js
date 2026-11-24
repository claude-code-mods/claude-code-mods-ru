// Model-free hand-over (requirements FR-15, UC-6; tech spec § 3.4). Pure: built only from records.
// It answers the eight questions and keeps three sources apart: what the user confirmed (the task),
// what tools observed (operations, evidence), and what Claude only claimed (never stored as a fact,
// so the hand-over says plainly that nothing claimed is shown as verified).

import { CAPS, sanitize } from './sanitize.js'
import { HARD_FORBIDDEN } from './policy.js'
import { evidenceCurrent } from './view.js'

const s = (x, n = 200) => sanitize(x, n)

// Each section is { heading, items, fixed }: headings and `fixed` lines always appear; `items` fill the
// remaining budget in order and the rest is counted, so the size cap never drops a heading or the
// limits disclosure (INV-005) the way truncating the finished text would.
function assemble(head, sections, cap) {
  const fixedText = [...head, ...sections.flatMap((x) => ['', x.heading, ...x.fixed])].join('\n')
  const omitLine = (n) => `- … ещё ${n} пропущено (лимит размера передачи)`
  let budget = cap - fixedText.length - sections.length * omitLine(99999).length
  const out = [...head]
  for (const x of sections) {
    out.push('', x.heading)
    let shown = 0
    for (const it of x.items) {
      if (it.length + 1 > budget) break
      out.push(it); budget -= it.length + 1; shown++
    }
    if (shown < x.items.length) out.push(omitLine(x.items.length - shown))
    out.push(...x.fixed)
  }
  return out.join('\n')
}

export function handoff({ task, state, evidence, fingerprint, decisions, now, sessionId }) {
  // When the last tree reading was taken: the hand-over starts no process, so it never re-reads.
  const seenAt = typeof fingerprint?.at === 'number' ? ` по состоянию на ${new Date(fingerprint.at).toISOString()}` : ''
  const head = [
    `# Передача — ${task ? s(task.goal, 120) : 'задача не привязана'}`,
    '',
    `Создано из структурированных записей ${new Date(now).toISOString()} (сессия ${s(sessionId, 60)}); модель не вызывалась.`,
  ]
  const sec = []
  sec.push({ heading: '## 1. Цель', items: [], fixed: [task ? s(task.goal, 500) : 'Для этой сессии задача не объявлялась.'] })
  const scope = []
  if (task) {
    scope.push(`- Рабочее дерево: ${s(task.worktree)}`)
    scope.push(`- Правки: ${(task.allow ?? []).includes('edit') ? `разрешены в ${(task.editRoots ?? ['.']).map((r) => s(r)).join(', ')}` : 'не разрешены'}`)
    scope.push(`- Разрешённые исполнители: ${(task.executors ?? []).map((e) => s(e.argv.join(' '))).join('; ') || 'нет'}`)
    scope.push(`- Запрещено: ${(task.forbid ?? []).map((f) => s(Array.isArray(f) ? f.join(' ') : f)).join('; ') || 'нет'}, плюс ${[...new Set(HARD_FORBIDDEN.map((h) => h.rule))].join(', ')}`)
    if (task.acceptance?.length) scope.push(`- Критерии приёмки: ${task.acceptance.map((a) => s(a)).join('; ')}`)
  }
  sec.push({ heading: '## 2. Разрешённая и запрещённая область', items: scope, fixed: task ? [] : ['- Область не объявлялась.'] })
  const ops = Object.entries(state.ops ?? {})
  const edits = ops.filter(([, o]) => ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'].includes(o.tool) && o.outcome === 'ok')
  sec.push({ heading: '## 3. Что изменилось', items: [], fixed: [
    fingerprint ? `- Tree: HEAD ${s(fingerprint.head, 60)}, ${fingerprint.changedCount ?? '?'} изменённых или неотслеживаемых путей (${fingerprint.coverage})${seenAt ? `, чтение${seenAt}` : ''}` : '- Дерево: для этой передачи не читалось',
    // Only the edit tools are counted here; a file changed through Bash shows in the tree line above
    // (found in an uncoached run: "Edits observed: 0" beside a changed README read as "nothing changed").
    `- Вызовы инструментов правки в этой сессии: ${edits.length} (изменения через Bash здесь не учитываются; запись о дереве — источник)`,
  ] })
  const ev = Object.values(evidence ?? {})
  const matches = (e) => fingerprint && e.after && e.before && e.before.value === e.after.value && e.after.value === fingerprint.value && e.outcome === 'ok'
  // Partial coverage is never "verified": what a reading did not cover may have changed — the
  // before, the after and the last reading must each be complete. The same rule `/agentctl` uses.
  const current = (e) => evidenceCurrent(e, fingerprint)
  const verified = ev.filter(current).map((e) => `- ${s(e.requested)} — ошибок не сообщалось, совпадает с последним чтением дерева${seenAt} (${e.coverage})`)
  sec.push({ heading: '## 4. Подтверждено (доказательства выполнения по последнему чтению дерева)', items: verified, fixed: verified.length ? [] : ['- Ничего.'] })
  const notVerified = ev.filter((e) => !current(e)).map((e) => {
    const why = e.outcome === 'backgrounded' ? 'запущено, завершение не наблюдалось' : e.outcome !== 'ok' ? `результат ${e.outcome}` : !e.after || !e.before ? 'доказательства недоступны' : e.before.value !== e.after.value ? 'дерево изменилось во время выполнения' : matches(e) ? 'неполное покрытие — часть дерева не читалась' : 'устарело — дерево с тех пор изменилось'
    return `- ${s(e.requested)} — ${why}`
  })
  sec.push({ heading: '## 5. Не подтверждено', items: notVerified, fixed: ['- Всё, что Клод назвал сделанным, пройденным или исправленным без доказательной записи выше, — только его собственная оценка.'] })
  const open = ops.filter(([, o]) => o.endedAt === undefined && o.outcome !== 'refused')
  const bg = Object.entries(state.background ?? {}).filter(([, b]) => b.status === 'started' || b.status === 'in-flight')
  const running = [
    ...open.map(([id, o]) => `- ${s(o.requested)} (${o.tool}, ${o.outcome}) — ${id}`),
    ...bg.map(([id, b]) => `- фоновая задача ${s(id, 60)} — ${b.status}${b.asOf ? ` по состоянию на ${new Date(b.asOf).toISOString()}` : ''}`),
  ]
  sec.push({ heading: '## 6. Ещё выполняется или неизвестно', items: running, fixed: running.length ? [] : ['- Не наблюдалось ничего выполняющегося. Неотслеживаемые процессы нельзя подтвердить ни так, ни этак.'] })
  const iv = Object.keys(state.interventions ?? {})
  sec.push({ heading: '## 7. Следующий шаг', items: [], fixed: [iv.length ? `- Разрешите: ${iv.map((x) => s(x, 60)).join(', ')}` : '- Ничего не записано. Решайте по разделам 4–6.'] })
  const refused = (decisions ?? []).filter((d) => d.outcome === 'deny' || d.outcome === 'unknown' || d.outcome === 'needs-user-refused')
  sec.push({ heading: '## 8. Ещё не разрешено', items: [], fixed: [
    ...(refused.length ? refused.slice(-10).map((d) => `- ${s(d.requested)} — ${s(d.rule)}`) : ['- В этой сессии вызовы не отклонялись; запрещённая область из раздела 2 всё ещё действует.']),
    '- Прежние разрешения не переносятся: при возобновлении каждый вызов классифицируется заново, и хост снова спрашивает.',
    // INV-005: what this mod cannot refuse is disclosed here as in /agentctl policy, never silent.
    '- Ограничения: если хост пропускает this mod\'s hook (worker crash, mod disabled) здесь ничего не запрещается; другой мод может изменить вердикт на tool.check. Жёсткие правила — в permissions.deny.',
  ] })
  return assemble(head, sec, CAPS.handoff)
}

// First run (tech spec § 3.7, 2026-10-07): parsing `/agentctl …`, the drafting request a goal
// prepares, and the copy a first-time user reads. Pure: no `$`, no I/O.
//
// Found by a user's first run of 0.2.2: every path assumed the vocabulary, so a sentence after
// `/agentctl` got the usage grammar. A goal now prepares a request for Claude in the person's own
// prompt box; nothing here sends or binds anything.

import { renderArgv } from './policy.js'

// Verbs and how many words may follow each. `task` and `events` check their own arguments.
export const VERBS = {
  status: { max: 1, args: ['--details'] },
  help: { max: 1, args: ['advanced'] },
  proposal: { max: 0 },
  accept: { max: 1 },
  discard: { max: 0 },
  task: { max: Infinity },
  policy: { max: 0 },
  events: { max: 1 },
  handoff: { max: 0 },
  last: { max: 0 },
  stop: { max: 0 },
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[a.length][b.length]
}

// What the line after `/agentctl` is: a verb (with its words), a near-miss of a verb, or a goal.
// Only a line that looks like command syntax — one ASCII word, optionally a digest or a number —
// can be a near-miss, so "test the login flow" stays a goal while "accepet ab12cd34" is corrected.
export function parseCommand(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return { kind: 'status', words: [] }
  const words = text.split(/\s+/)
  const head = words[0].toLowerCase()
  if (Object.hasOwn(VERBS, head)) {
    const rest = words.slice(1)
    const v = VERBS[head]
    if (rest.length > v.max) return { kind: 'extra', verb: head, rest }
    if (v.args && rest.length && !v.args.includes(rest[0])) return { kind: 'extra', verb: head, rest }
    return { kind: 'verb', verb: head, rest }
  }
  if (/^[a-z]{3,}(\s+[0-9a-z]{1,24})?$/i.test(text)) {
    let best = null
    for (const v of Object.keys(VERBS)) {
      const d = distance(head, v)
      if (d <= 2 && (!best || d < best.d)) best = { v, d }
    }
    if (best) return { kind: 'typo', verb: best.v, words }
  }
  return { kind: 'goal', text }
}

// A limited English / Traditional Chinese copy heuristic over the goal text — not locale detection.
export function languageOf(goal) {
  return /\p{Script=Han}/u.test(String(goal ?? '')) ? 'zh' : 'en'
}

// A path for a POSIX shell, single-quoted: the only character needing care inside is `'` itself.
export function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

// The helper lives in the mod; `$.plugin.root` is the plugin's directory, but tolerate a root that
// points at `.claude-plugin` itself.
export function helperPath(root) {
  const r = String(root ?? '').replace(/\/+$/, '')
  return `${r.endsWith('/.claude-plugin') ? r.slice(0, -'/.claude-plugin'.length) : r}/bin/propose.mjs`
}

// The request the person sends to Claude. The goal is quoted verbatim and never truncated; the rest
// is fixed text kept short, since it becomes one ordinary model turn.
export function draftingRequest({ goal, worktree, base, root, lang }) {
  const helper = `node ${shellQuote(helperPath(root))} --worktree ${shellQuote(worktree)} --stdin`
  const baseText = base ? `"${base}"` : 'null'
  if (lang === 'zh') {
    return [
      `請為這件事起草 agentctl 任務範圍：「${goal}」`,
      `先跑 ${helper.replace(' --stdin', ' --help')} 看欄位，讀專案後提出最窄範圍（編輯路徑、檢查指令、驗收）。有不清楚的地方就問我並等我回答——回答前不要寫 proposal，也別自己加權限。`,
      `用 ${helper} 寫入（base 為 ${baseText}；heredoc 分隔字加引號且不在 JSON 內），只寫 proposal，然後等我確認。`,
    ].join('\n')
  }
  return [
    `Сформулируйте область задачи agentctl для: "${goal}"`,
    `Сначала запустите ${helper.replace(' --stdin', ' --help')}, чтобы узнать поля. Изучите проект и предложите самую узкую область (пути правки, команды проверки, критерии приёмки). Если что-то неясно, спросите меня и дождитесь ответа — до этого не пишите proposal и не придумывайте разрешения.`,
    `Запишите его через ${helper} (base ${baseText}; разделитель heredoc в кавычках, которого нет в JSON). Напишите только proposal, затем дождитесь моего подтверждения.`,
  ].join('\n')
}

const COPY = {
  en: {
    filled: (bound) => `Запрос Клоду сформулировать область задачи уже в поле ввода — нажмите Enter, чтобы отправить. ${bound ? 'Текущая задача действует, пока вы не примете новую область.' : 'Пока ничего не привязано.'}`,
    mixed: (bound) => `Запрос добавлен после набранного вами текста; оба находятся в поле ввода. Отредактируйте перед нажатием Enter. ${bound ? 'Текущая задача действует, пока вы не примете новую область.' : 'Пока ничего не привязано.'}`,
    copy: (bound) => `Отправьте это Клоду, чтобы он сформулировал область (${bound ? 'текущая задача действует, пока вы не примете новую' : 'пока ничего не привязано'}):`,
    typo: (v) => `Возможно, вы имели в виду "/agentctl ${v}"? Чтобы начать задачу, опишите её: /agentctl <что вы делаете>`,
    extra: (v) => `"/agentctl ${v}" не принимает таких аргументов. ${v === 'proposal' ? 'Он показывает ожидающий черновик; чтобы создать его, опишите работу: /agentctl <что вы делаете>' : 'См. /agentctl help.'}`,
    acceptLine: (d) => `Принять эту область: /agentctl accept ${d} — это только привязывает область, но не начинает работу.`,
    accepted: 'Область привязана. Далее: попросите Клода начать работу.',
    runChecks: (checks) => `Чтобы оставить доказательства, выполните каждую проверку в точности как написано: ${checks.join(' · ')} — конвейер, перенаправление или обёртка не засчитываются, а добавленные аргументы могут проверять меньше объявленного.`,
    wholeScope: '/agentctl policy показывает всю область.',
    noTaskLast: 'Задача не привязана, поэтому передачи ещё нет. Начните: /agentctl <что вы делаете>',
    noHandover: 'У этой задачи ещё нет сохранённой передачи: /agentctl handoff сохранит её.',
    next: {
      none: 'Далее: опишите работу — /agentctl <что вы делаете>. Встроенные запреты (прямой git push, запись в продакшн) действуют и сейчас.',
      proposal: (d) => `Далее: посмотрите /agentctl proposal, затем /agentctl accept ${d}`,
      task: 'Далее: попросите Клода работать; /agentctl handoff сохранит текущее состояние.',
      taskThenChecks: (checks) => `Далее: попросите Клода поработать, затем выполнить проверки в точности как написано: ${checks.join(' · ')}. Когда они актуальны: /agentctl handoff`,
      rerun: (checks) => `Далее: на этом дереве проверки не актуальны — попросите Клода выполнить в точности как написано: ${checks.join(' · ')}. Затем: /agentctl handoff`,
      checksCurrent: 'Далее: все объявленные проверки актуальны на этом дереве — /agentctl handoff сохранит передачу.',
    },
  },
  zh: {
    filled: (bound) => `已把請 Claude 起草範圍的請求放進輸入框——按 Enter 送出。${bound ? '接受新範圍之前，目前的任務照舊生效。' : '目前尚未綁定任何範圍。'}`,
    mixed: (bound) => `請求接在你剛才打的字後面，兩者都在輸入框裡；送出前請先整理。${bound ? '接受新範圍之前，目前的任務照舊生效。' : '目前尚未綁定任何範圍。'}`,
    copy: (bound) => `把這段送給 Claude 讓它起草範圍（${bound ? '接受新範圍之前，目前的任務照舊生效' : '目前尚未綁定任何範圍'}）：`,
    typo: (v) => `你是要用「/agentctl ${v}」嗎？要開始任務，請描述它：/agentctl <你要做的事>`,
    extra: (v) => `「/agentctl ${v}」不接受這些參數。${v === 'proposal' ? '它只顯示等待中的草稿；要起草，請描述工作：/agentctl <你要做的事>' : '見 /agentctl help。'}`,
    acceptLine: (d) => `確認此範圍：/agentctl accept ${d} ——只會綁定範圍，不會開始任何工作。`,
    accepted: '範圍已綁定。下一步：請 Claude 開始這項工作。',
    runChecks: (checks) => `要留下證據，請照原樣執行每條檢查：${checks.join(' · ')} ——加 pipe、redirect 或外層包裝就不算；多加參數可能只檢查到一部分。`,
    wholeScope: '完整範圍：/agentctl policy',
    noTaskLast: '目前沒有綁定任務，所以還沒有交接紀錄。開始一個：/agentctl <你要做的事>',
    noHandover: '這個任務還沒有存過交接：/agentctl handoff 會存一份。',
    next: {
      none: '下一步：描述工作——/agentctl <你要做的事>。內建規則（直接 git push、production 寫入）現在就會擋。',
      proposal: (d) => `下一步：看 /agentctl proposal，再 /agentctl accept ${d}`,
      task: '下一步：請 Claude 開始工作；/agentctl handoff 會存下目前進度。',
      taskThenChecks: (checks) => `下一步：請 Claude 開始工作，完成後逐字執行檢查：${checks.join(' · ')}。檢查都是最新的之後：/agentctl handoff`,
      rerun: (checks) => `下一步：這些檢查在目前的程式碼上不是最新的——請 Claude 逐字執行：${checks.join(' · ')}。之後：/agentctl handoff`,
      checksCurrent: '下一步：宣告的檢查在目前的程式碼上都是最新的——/agentctl handoff 會存下交接。',
    },
  },
}

export function copy(lang) {
  return COPY[lang === 'zh' ? 'zh' : 'en']
}

// A check as a line Claude can run as written: quoted so it reads back as the declared argv, never
// shortened. An argv no quoting can carry is shown as its JSON array instead, which says to run it as
// those words.
export function checkLine(argv) {
  return renderArgv(argv) ?? `${JSON.stringify(argv)} (как эти слова)`
}

// The task's declared checks, as the command lines Claude must run as written.
export function checkArgv(task) {
  return (task?.executors ?? []).filter((e) => e.check).map((e) => checkLine(e.argv))
}

// The next step for a bound task, from where its declared checks stand (`checkProgress` in view.js).
// Found in an uncoached run: with the work done, "ask Claude to start" was still the next step.
export function nextForTask(t, progress) {
  if (!progress.declared) return t.next.task
  if (!progress.pending.length) return t.next.checksCurrent
  return progress.ran ? t.next.rerun(progress.pending) : t.next.taskThenChecks(progress.pending)
}

export function helpText(lang, advanced) {
  if (lang === 'zh') {
    return advanced ? [
      '進階：',
      '  /agentctl task show | set <json> | clear — 直接檢視或設定任務',
      '  /agentctl policy — 目前範圍與限制',
      '  /agentctl events [n] — 最近的拒絕與交給 host 的呼叫',
      '  /agentctl handoff · last — 存下交接 · 顯示上次的交接',
      '  /agentctl stop — 取消目前回合並存下交接',
      '  /agentctl status --details · discard — 完整狀態 · 丟棄草稿',
    ].join('\n') : [
      'agentctl 讓 Claude 在你確認的範圍內工作，並記錄檢查證據。',
      '  /agentctl <你要做的事> — Claude 起草範圍（不會綁定）',
      '  /agentctl accept <digest> — 你確認範圍（不會開始工作）',
      '  /agentctl — 目前狀態與下一步',
      '更多：/agentctl help advanced',
    ].join('\n')
  }
  return advanced ? [
    'Дополнительно:',
    '  /agentctl task show | set <json> | clear — просмотреть или задать задачу напрямую',
    '  /agentctl policy — действующая область и её ограничения',
    '  /agentctl events [n] — последние отказы и вызовы, переданные хосту',
    '  /agentctl handoff · last — сохранить передачу · показать последнюю',
    '  /agentctl stop — отменить ход и сохранить передачу',
    '  /agentctl status --details · discard — полный статус · удалить черновик',
  ].join('\n') : [
    'agentctl удерживает Клода в подтверждённой вами области и записывает доказательства проверок.',
    '  /agentctl <что вы делаете> — Клод формулирует область (ничего не привязывает)',
    '  /agentctl accept <digest> — вы подтверждаете её (работа не начинается)',
    '  /agentctl — текущее состояние и следующие шаги',
    'Подробнее: /agentctl help advanced',
  ].join('\n')
}

// What the box should suggest while a proposal waits (found live on 2.1.292: the host's own guess —
// "確認" — took the box, so Tab + Enter sent that word to Claude instead of accepting). Only the
// host's own guess is replaced, and only while a proposal is waiting; a plugin's suggestion, ours
// included, passes unchanged.
export function suggestionWhileWaiting(originKind, pendingDigest) {
  return originKind === 'suggestion' && pendingDigest ? `/agentctl accept ${String(pendingDigest).slice(0, 8)}` : null
}

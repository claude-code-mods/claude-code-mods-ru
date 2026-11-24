import { isQuestionBack, recommendedOption, rewordedQuestion } from './ask-match'
import { closeByAgent, reopenItem } from './ledger-close'
import { addAgentItem, addFinding } from './ledger-update'
import { stepHelp } from './reply-parse'
import type { Host } from './model-text'
import { MAX_ORDERED_PRS, tabPrs } from './pr-fetch'
import { isDismissed } from './pr-views'
import { bodyChanges, missingText, questionBody, withBody } from './question-checks'
import { CLOSE_SCHEMA, ORDER_SCHEMA, RECORD_SCHEMA } from './tool-schemas'
import type { Closed, Help, Item, LastAction, Ledger, ToolFields } from '../types'

const NAME_BY_CONTENT = 'Name it by what it says, never by its id.'

function orderDescription(host: Host): string {
  return `Set the order of the user's PRs in ${host.prsIn}, when the user asks for an order there. Those PRs show first, in this order. Each call replaces the order, and an empty numbers list clears it.`
}

function recordDescription(host: Host): string {
  return `Record something the user must see in ${host.surface}, and still say it in your reply. Use it in the turn you raise it, once for each thing.
- question: a decision, approval or piece of information only the user has, which you need before you go on. Give options, and rec with why when you recommend one. This includes an act you hold until they say so, such as "say when you want those committed".
- task: a step only the user can do, such as signing in or running a command with their password. Put the commands, files and links in steps. A step your own tools can take is not a task: take it, or ask for their OK as a question when it changes something other people see.
- finding: something outside the current task that deserves their attention. It waits in ${host.findingsIn} until it is closed, and the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, once you have checked it. Leave out style nits, a PR's checks, conflicts, review threads or readiness, which ${host.prsIn} shows, anything the user already decided, todos or ideas the user mentioned, problems in your own change, progress, and anything only the user can do or decide: handle those in your reply, or record them as a question or task.
Do not record rhetorical questions, offers to continue when continuing is the default, FYIs, or invitations to look at finished work.`
}

const CLOSE_DESCRIPTION = `Close an open item or finding by its id, such as i35 or f12, as listed in the latest "inbox:" text beside the user's prompt. Pass the user's answer when their message answered it, and a reason otherwise.`

const AGENT_TOOLS = ['record', 'close', 'order_prs'] as const

export type AgentTool = (typeof AGENT_TOOLS)[number]

/** The tools the agent calls. A host registers these through its own API and answers each call with `toolAnswer`. */
export function agentTools(
  host: Host,
): { name: AgentTool; description: string; inputSchema: Record<string, unknown> }[] {
  return [
    { name: 'record', description: recordDescription(host), inputSchema: RECORD_SCHEMA },
    { name: 'close', description: CLOSE_DESCRIPTION, inputSchema: CLOSE_SCHEMA },
    { name: 'order_prs', description: orderDescription(host), inputSchema: ORDER_SCHEMA },
  ]
}

export function isAgentTool(name: string): name is AgentTool {
  return (AGENT_TOOLS as readonly string[]).includes(name)
}

/** The person's latest press on each row, and when the running turn started, or null when the host did not say. */
type Presses = { lastActions: Record<string, LastAction>; turnStartedAt: number | null }

/**
 * The answer to a call of one of `agentTools`. `fields` are the input fields of the tools the agent has, which can be
 * an older build's, so the answer never asks for a field the agent cannot send.
 */
export function toolAnswer(
  host: Host,
  ledger: Ledger,
  tool: AgentTool,
  input: Record<string, unknown>,
  now: number,
  presses: Presses,
  fields: ToolFields,
): ToolAnswer {
  switch (tool) {
    case 'record':
      return (
        recordAfterCompare(host, ledger, input, now, presses, fields) ?? recordItem(host, ledger, input, now, fields)
      )
    case 'close':
      return recordClose(host, ledger, input, now, presses)
    case 'order_prs':
      return orderPrs(host, ledger, input, now, presses.lastActions)
  }
}

function cut(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

const MAX_ASK = 200
const MAX_OPTION = 60
const MAX_OPTIONS = 8
const MAX_STEPS = 3
const MAX_REASON = 120

function list(value: unknown, max: number, each: number): string[] {
  return Array.isArray(value)
    ? value
        .map(v => cut(v, each))
        .filter(Boolean)
        .slice(0, max)
    : []
}

/**
 * A `record` or `close` call's answer. `result` is the text the agent reads back. `personLine` is the line the person
 * sees under the call in the conversation, or null when the call changed nothing in the inbox.
 */
export type ToolAnswer = { ledger: Ledger; result: string; personLine: string | null }

/** What follows an answer whose change the user sees now, when the store refused to save the session as full. */
export const NOT_SAVED = "Not saved: the inbox's store is full, so this change is lost if this session restarts."

function unchanged(ledger: Ledger, result: string): ToolAnswer {
  return { ledger, result, personLine: null }
}

export function recordItem(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  fields: ToolFields,
): ToolAnswer {
  if (input.kind === 'finding') return recordFinding(host, ledger, input, now)
  if (input.kind !== 'question' && input.kind !== 'task')
    return unchanged(ledger, 'Not recorded: kind must be question, task or finding.')
  const ask = cut(input.ask, MAX_ASK)
  if (ask === '') return unchanged(ledger, `Not recorded: a ${input.kind} needs an ask.`)
  const options = input.kind === 'question' ? list(input.options, MAX_OPTIONS, MAX_OPTION) : []
  if (input.kind === 'question' && options.length === 0)
    return unchanged(ledger, 'Not recorded: a question needs at least one option.')
  const recInput = input.kind === 'question' ? cut(input.rec, MAX_OPTION) : ''
  const rec = recInput === '' ? null : recommendedOption(options, recInput)
  if (recInput !== '' && rec === null) return unchanged(ledger, 'Not recorded: rec must be one of the options.')
  const recReason = rec ? cut(input.why, MAX_REASON).replace(/^because\s+/i, '') : ''
  const steps = list(input.steps, MAX_STEPS + 3, 4000)
  const isUsable = (h: Help) => input.kind === 'task' || h.kind === 'open' || h.kind === 'link'
  const helps = steps
    .flatMap(step => stepHelp(step) ?? [])
    .filter(isUsable)
    .slice(0, MAX_STEPS)
  const leftOut =
    helps.length < steps.length
      ? input.kind === 'task'
        ? ' Some steps were not a command, a file path or a link, so they are left out.'
        : ' Some steps were not an absolute file path or a link, so they are left out.'
      : ''

  const isDesignChoice = input.kind === 'question' && input.design_choice === true
  const kind: Item['kind'] = input.kind
  const entry = { kind, ask, options, rec, helps, isDesignChoice, ...(recReason ? { recReason } : {}) }
  const body = input.kind === 'question' ? questionBody(input, options) : {}
  const reworded =
    body.context && input.kind === 'question' ? rewordedQuestion(ledger.items, ledger.turn, entry) : undefined
  const r = addAgentItem(ledger, reworded ? { ...entry, ask: reworded.ask } : entry, now)
  if (r.is === 'closed')
    return unchanged(
      ledger,
      'title' in r.record
        ? `Not recorded: the user dismissed the finding "${r.record.title}", which this raises. Ask about it only if they bring it up.`
        : `Не записано: ${closedHow(r.record)}. Спрашивайте снова, только если пользователь поднимет тему.`,
    )
  const before = r.ledger.items.find(i => i.id === r.id)
  const after = before && withBody(before, body)
  const rewordedAsk = reworded && r.is === 'open' && r.id === reworded.id ? { ask } : {}
  const recorded = {
    ...r.ledger,
    items: r.ledger.items.map(i => (i === before && after ? { ...after, ...rewordedAsk } : i)),
  }
  if (r.is === 'open') {
    const changes = [
      ...(r.addedSteps > 0 ? ['added its new steps'] : []),
      ...(r.isNewlyMarked ? ['marked it as a design choice'] : []),
      ...(r.newRec ? [`changed its recommendation to ${r.newRec}`] : []),
      ...(r.isNewReason ? ['gave its recommendation your reason'] : []),
      ...(before && after ? bodyChanges(before, after) : []),
    ]
    const updated = changes.length > 0 ? ` and ${changes.join(' and ')}` : ''

    return unchanged(recorded, `Уже открыто, поэтому запись обновила его${updated}.${leftOut}`)
  }

  return {
    ledger: recorded,
    result:
      `Записано. Пользователь видит это в ${host.surface}.` +
      leftOut +
      missingText(after, fields.record) +
      (r.expired ? ` Список был полон, поэтому старейший пункт закрыт: ${r.expired.ask}.` : ''),
    personLine: `${input.kind === 'question' ? 'Вопрос' : 'Задача'}: ${ask}`,
  }
}

function recordFinding(host: Host, ledger: Ledger, input: Record<string, unknown>, now: number): ToolAnswer {
  const title = cut(input.title, 120)
  const detail = cut(input.detail, 600)
  if (title === '' || detail === '') return unchanged(ledger, 'Не записано: у замечания должны быть заголовок и описание.')
  const path = cut(input.path, 300)
  const kind = input.finding_kind === 'opportunity' ? 'opportunity' : 'issue'
  const r = addFinding(ledger, { kind, title, detail, path: path || null, at: now })

  if (r.dismissed)
    return unchanged(
      ledger,
      `Не записано: пользователь уже закрыл это (${r.dismissed.outcome}). Записывайте снова, только если пользователь поднимет тему.`,
    )
  if (!r.isAdded) return unchanged(r.ledger, 'Уже записано.')

  return {
    ledger: r.ledger,
    result:
      `Записано. Пользователь видит это в ${host.findingsIn}.` +
      (r.expired ? ` Список был полон, поэтому старейшее замечание закрыто: ${r.expired.title}.` : ''),
    personLine: `${kind === 'opportunity' ? 'Возможность' : 'Проблема'}: ${title}`,
  }
}

function closedHow(c: Pick<Closed, 'how' | 'outcome'>): string {
  switch (c.how) {
    case 'answered':
      return `пользователь ответил (${c.outcome})`
    case 'done':
      return 'пользователь отметил его выполненным'
    case 'dismissed':
      return 'пользователь отклонил его'
    case 'expired':
      return 'срок истёк'
    case 'claude':
      return 'вы закрыли его ранее'
    case 'update':
      return `inbox закрыл его (${c.outcome})`
  }
}

/** Whether `at` falls in the running turn, after the person's Compare press on `id`. */
function isAfterCompareThisTurn(id: string, at: number, presses: Presses): boolean {
  const last = presses.lastActions[id]

  return last?.action === 'compare' && at >= Math.max(last.at, presses.turnStartedAt ?? last.at)
}

/**
 * Whether the agent recorded `id` again this turn, after the person pressed Compare on it. That record updated the open
 * question, so a close with a reason would only replace it with a copy.
 */
function isRecordedAfterCompare(ledger: Ledger, id: string, presses: Presses): boolean {
  const item = ledger.items.find(i => i.id === id)
  if (item?.kind !== 'question' || item.reportedAt === undefined) return false

  return isAfterCompareThisTurn(id, item.reportedAt, presses)
}

/**
 * A record of a question the agent closed with a reason this turn, after the person pressed Compare on it. The question
 * reopens and the record updates it, as when the close comes after the record. Null when no such question matches.
 */
function recordAfterCompare(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  presses: Presses,
  fields: ToolFields,
): ToolAnswer | null {
  const isClosedAfterCompare = (c: Closed) =>
    c.how === 'claude' && c.kind === 'question' && isAfterCompareThisTurn(c.id, c.at, presses)
  const closed = ledger.closed.findLast(isClosedAfterCompare)
  if (!closed) return null
  const r = recordItem(host, reopenItem(ledger, closed.id), input, now, fields)
  const isUpdated = r.ledger.items.some(i => i.id === closed.id && i.reportedAt === now)

  return isUpdated ? r : null
}

export function recordClose(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  presses: Presses,
): ToolAnswer {
  const id = cut(input.id, 80).replace(/^\[|\]$/g, '')
  const answer = cut(input.answer, 80)
  const reason = cut(input.reason, 80)
  if (id === '' || (answer === '' && reason === ''))
    return unchanged(ledger, "Не закрыто: укажите id и ответ пользователя или причину.")
  if (answer === '' && isRecordedAfterCompare(ledger, id, presses))
    return unchanged(ledger, 'Не закрыто: ваша запись обновила этот вопрос, и он остаётся открытым для пользователя.')
  const item = ledger.items.find(i => i.id === id)
  if (item?.kind === 'question' && answer !== '' && isQuestionBack(answer, item.options))
    return unchanged(
      ledger,
      'Не закрыто: пользователь задал встречный вопрос, поэтому пункт остаётся открытым. Ответьте в своём ответе и закройте его, когда пользователь решит.',
    )
  const r = closeByAgent(host, ledger, id, answer ? { answer } : { reason }, now)
  if (r.closed && 'item' in r.closed)
    return {
      ledger: r.ledger,
      result: `Закрыто. Пользователь видит это в ${host.surface} с результатом. ${NAME_BY_CONTENT}`,
      personLine: `Closed: ${r.closed.item.ask}`,
    }
  if (r.closed)
    return {
      ledger: r.ledger,
      result: `Замечание закрыто. ${NAME_BY_CONTENT}`,
      personLine: `Closed: ${r.closed.finding.title}`,
    }
  const earlier = [...ledger.closed, ...ledger.closedFindings].findLast(c => c.id === id)
  if (earlier) return unchanged(ledger, `Уже закрыто: ${closedHow(earlier)}.`)

  return unchanged(
    ledger,
    `Не закрыто: ни у одного открытого пункта или замечания нет id ${id}. Открытые перечислены рядом с последним сообщением пользователя.`,
  )
}

const REPO = /^[\w.-]+\/[\w.-]+$/
const MAX_ORDER_LABEL = 40
const MAX_ORDER_WHY = 300

/** A PR number as the agent gave it, as 3401 or "#3401", or null when it is not one. */
function prNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim().replace(/^#/, '')) : NaN

  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Sets the PRs tab's order from an `order_prs` call. The tab shows and fetches each PR the order ranks, without
 * linking it, so a new order or an empty list, which clears it, takes the old order's PRs off the tab. A PR the
 * person or a fetch dismissed stays off it.
 */
function orderPrs(
  host: Host,
  ledger: Ledger,
  input: Record<string, unknown>,
  now: number,
  lastActions: Record<string, LastAction>,
): ToolAnswer {
  if (!Array.isArray(input.numbers)) return unchanged(ledger, 'Не задано: numbers должен быть списком номеров PR.')
  if (input.numbers.length === 0) {
    if (ledger.prOrder === null) return unchanged(ledger, 'Порядок не был задан.')

    return {
      ledger: { ...ledger, prOrder: null },
      result: `Сброшено. PR показываются в обычном порядке в ${host.prsIn}.`,
      personLine: 'Порядок PR сброшен',
    }
  }
  const numbers = input.numbers.map(prNumber)
  if (numbers.includes(null)) return unchanged(ledger, 'Не задано: numbers должны быть номерами PR, например 3401.')
  const repo = cut(input.repo, 200)
  if (!REPO.test(repo)) return unchanged(ledger, 'Не задано: укажите repo в формате owner/name.')
  const refs = [...new Set(numbers.map(n => `${repo}#${n}`))]
  if (refs.length > MAX_ORDERED_PRS) return unchanged(ledger, `Not set: an order ranks at most ${MAX_ORDERED_PRS} PRs.`)
  const label = cut(input.label, MAX_ORDER_LABEL)
  if (!label) return unchanged(ledger, 'Не задано: укажите label — для чего пользователю этот порядок.')
  const why = cut(input.why, MAX_ORDER_WHY)
  if (!why) return unchanged(ledger, 'Не задано: укажите why — причину этого порядка.')
  const dismissed = refs.filter(ref => isDismissed(lastActions, ref) || ledger.prOrder?.dismissed.includes(ref))
  const onTab = tabPrs(ledger)
  const added = refs.filter(ref => !onTab.includes(ref))
  const addedText =
    added.length === 0
      ? ''
      : added.length === 1
        ? " 1 of them was not in the tab yet. It shows after the tab's next refresh, if the user wrote it and it is open."
        : ` ${added.length} of them were not in the tab yet. They show after the tab's next refresh, if the user wrote them and they are open.`

  return {
    ledger: {
      ...ledger,
      prOrder: { refs, label, why, statuses: {}, dismissed, by: host.agent, at: now },
    },
    result: `Задано. Эти ${refs.length} PR показываются первыми в ${host.prsIn} в этом порядке.${addedText}`,
    personLine: `Порядок PR: ${label}, ${refs.length} PR`,
  }
}

// Task proposals (2026-10-04 brainstorm equilibrium): Claude drafts a scope into a file outside the
// worktree; the mod reads it once, validates it and keeps the effective object; only the person at
// the prompt binds it, with `/agentctl accept`. The file is an untrusted submission channel — what is
// accepted is the retained object the preview showed, never the file re-read at accept time.
// Pure apart from `crypto.subtle`: no `$`, no I/O.

import { taskRecord, validateTask } from './policy.js'
import { sanitize } from './sanitize.js'

export const MAX_PROPOSAL_BYTES = 16 * 1024
export const DIGEST_HEX = 24

// The proposal file for a worktree, under the user's home and never inside the worktree (a file there
// would change the tree fingerprint it is meant to be judged by).
export function proposalPath(home, worktreeKey) {
  return `${String(home).replace(/\/+$/, '')}/.claude/agentctl/proposals/${worktreeKey}.json`
}

// Parse and validate a proposal against this session's worktree and the task bound right now.
// `base` in the file is the task id Claude saw bound (null for none); a mismatch is stale. Omitted, it
// is the task bound when the mod reads the file — the preview names it, and accept still refuses if
// the binding changed after the preview.
export function readProposal(text, { cwd, boundId }) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, errors: ['файл черновика пуст'] }
  // Bytes, not UTF-16 code units: a non-ASCII draft is up to three times longer on disk.
  if (new TextEncoder().encode(text).length > MAX_PROPOSAL_BYTES) return { ok: false, errors: [`черновик превышает ${MAX_PROPOSAL_BYTES} байт`] }
  let input
  try { input = JSON.parse(text) } catch { return { ok: false, errors: ['черновик не является JSON'] } }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['черновик должен быть объектом JSON'] }
  // The worktree comes from the session; a proposal naming another one is refused, never re-pointed.
  if (input.worktree !== undefined && input.worktree !== cwd) return { ok: false, errors: ['в черновике указано другое рабочее дерево'] }
  const base = input.base === undefined ? (boundId ?? null) : input.base
  if (base !== null && typeof base !== 'string') return { ok: false, errors: ['base должен быть id привязанной задачи или null'] }
  if (base !== (boundId ?? null)) return { ok: false, stale: true, errors: [`stale: drafted against ${base ? `task ${sanitize(base, 64)}` : 'задача не привязана'}, но сейчас привязано: ${boundId ? `задача ${sanitize(boundId, 64)}` : 'ничего'}`] }
  const { base: _b, id: _i, ...draft } = input
  const v = validateTask({ ...draft, worktree: cwd })
  if (!v.ok) return { ok: false, errors: v.errors.map((x) => sanitize(x, 200)) }
  // The effective object: exactly the fields a bound task is matched by, normalized as stored.
  const r = taskRecord({ ...draft, worktree: cwd }, { id: 'pending', now: 0, cwd })
  const effective = {
    goal: r.goal, worktree: r.worktree, allow: r.allow, editRoots: r.editRoots, forbid: r.forbid,
    executors: r.executors, needsUser: r.needsUser, tools: r.tools, acceptance: r.acceptance, base,
  }
  return { ok: true, effective }
}

// SHA-256 over the canonical effective object (fixed key order by construction), first 24 hex.
export async function proposalDigest(effective) {
  const bytes = new TextEncoder().encode(JSON.stringify(effective))
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, DIGEST_HEX)
}

// A digest given at accept must be a prefix of the pending one, at least 8 hex long.
export function digestMatches(given, pending) {
  if (given === undefined || given === '') return true
  return /^[0-9a-f]{8,24}$/.test(given) && pending.startsWith(given)
}

// The task record bound at accept: the retained effective object, a fresh id, the policy version
// following the task it replaces.
export function acceptedRecord(effective, { now, baseTask }) {
  const { base: _b, ...fields } = effective
  return taskRecord({ ...fields, policyVersion: baseTask ? (baseTask.policyVersion ?? 1) : 0 }, { id: `T${now}`, now, cwd: effective.worktree })
}

// Every permission being accepted is listed; nothing is silently truncated beyond the per-entry cap.
export function previewLines(pending) {
  const e = pending.effective
  const one = (x) => (Array.isArray(x) ? x.join(' ') : Array.isArray(x?.argv) ? x.argv.join(' ') + (x.check ? ' (проверка)' : '') : String(x))
  const fmt = (xs) => (xs?.length ? xs.map((x) => sanitize(one(x), 160)).join('; ') : 'нет')
  return [
    `Предлагаемая задача ${pending.digest} — ${sanitize(e.goal, 120)}`,
    `  Заменяет: ${e.base ? `задачу ${sanitize(e.base, 64)}` : 'ничего (задача не привязана)'}`,
    `  Правки: ${e.allow.includes('edit') ? `разрешены в ${fmt(e.editRoots)}` : 'не разрешены'}`,
    `  Проверки и исполнители: ${fmt(e.executors)}`,
    `  Требует человека: ${fmt(e.needsUser)}`,
    `  Другие инструменты: ${fmt(e.tools)}`,
    `  Запрещено (задача): ${fmt(e.forbid)} · плюс встроенные классы записи в продакшн и записи в удалённый git`,
    ...(e.acceptance.length ? [`  Приёмка: ${e.acceptance.map((a) => sanitize(a, 160)).join('; ')}`] : []),
    `  Принять область: /agentctl accept ${pending.digest.slice(0, 8)} — это только привязывает область, но не начинает работу · или /agentctl discard`,
  ]
}

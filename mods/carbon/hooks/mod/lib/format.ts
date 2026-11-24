// What an answer's CO2 line says and when it raises its voice. Pure: no Claude Code API, so
// Node runs it directly (tests/run-mod-tests.mjs).

export type Lang = "fr" | "en" | "ru";

export type AnswerCo2View = {
  // "16 гCO₂" или "230 гCO₂ · 14× ваша медиана" для необычного ответа
  main: string;
  // "вкл. 3 субагента : 22 гCO₂", только когда субагенты повлияли на необычный ответ
  sub: string | null;
  isUnusual: boolean;
};

export type TurnTotals = {
  grams: number;
  subagentGrams: number;
  subagents: number;
};

export const HISTORY_SIZE = 200;
export const MIN_HISTORY = 50;
// About 1 answer in 27 stands out: above the 97th percentile of the history. The 3x
// median and the 10 g floor stay as guards: over a flat history the percentile is
// the median itself.
export const UNUSUAL_PERCENTILE = 0.97;
export const UNUSUAL_RATIO = 3;
export const UNUSUAL_FLOOR_GRAMS = 10;
export const SUBAGENT_SHARE = 0.1;

const NBSP = " ";
const UNIT = "CO₂";

// Unset, empty, C and POSIX say nothing about the language.
function isLocaleValue(value: string | undefined): value is string {
  return (
    value !== undefined &&
    value !== "" &&
    value !== "C" &&
    !value.startsWith("C.") &&
    value !== "POSIX" &&
    !value.startsWith("POSIX.")
  );
}

// Same order and sentinels as detect_equiv_set (scripts/equiv-lib.sh). With no
// variable set, the language setting decides; with none, French, as in the bash.
export function detectLang(
  envValues: Array<string | undefined>,
  setting?: string,
): Lang {
  const value = envValues.find(isLocaleValue);
  if (value !== undefined) {
    const v = value.toLowerCase();
    return v.startsWith("fr") ? "fr" : /^ru|русск|russian/.test(v) ? "ru" : "en";
  }
  if (setting !== undefined && setting !== "") {
    const v = setting.toLowerCase();
    return v.startsWith("fr") ? "fr" : /^ru|русск|russian/.test(v) ? "ru" : "en";
  }
  return "en";
}

// Whether one of the variables decides alone, so nothing else needs to be asked.
export function hasLangVariable(envValues: Array<string | undefined>): boolean {
  return envValues.some(isLocaleValue);
}

// The `language` setting is free text ("Français", "English", "japanese"). It goes
// to detectLang as a locale would: French when it starts with "fr", English otherwise.
export function languageSetting(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text === "") return undefined;
  const lower = text.toLowerCase();
  if (/^ru|русск|russian/.test(lower)) return "Русский";
  return text;
}

function decimal(value: number, digits: number, lang: Lang): string {
  const text = value.toFixed(digits);
  return lang === "en" ? text : text.replace(".", ",");
}

// < 0.1 g, one decimal under 10 g, whole grams under 1 kg, then kg with one decimal.
// Rounding keeps the figure readable; the estimate itself is far less precise than one
// decimal.
export function formatGrams(grams: number, lang: Lang): string {
  const unit = lang === "ru" ? "г" : "g";
  if (grams < 0.1) return `<${NBSP}${decimal(0.1, 1, lang)}${NBSP}${unit}${UNIT}`;
  const tenths = Math.round(grams * 10) / 10;
  if (tenths < 10) return `${decimal(tenths, 1, lang)}${NBSP}${unit}${UNIT}`;
  const whole = Math.round(grams);
  if (whole < 1000) return `${whole}${NBSP}${unit}${UNIT}`;
  const kilos = Math.round(grams / 100) / 10;
  return `${decimal(kilos, 1, lang)}${NBSP}${lang === "ru" ? "кг" : "kg"}${UNIT}`;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
}

// Linear interpolation between the two closest ranks, q from 0 to 1.
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * Math.min(Math.max(q, 0), 1);
  const lower = Math.floor(rank);
  const low = sorted[lower] ?? 0;
  const high = sorted[Math.min(lower + 1, sorted.length - 1)] ?? low;
  return low + (high - low) * (rank - lower);
}

// The current answer is compared before it joins the history.
export function isUnusual(grams: number, history: number[]): boolean {
  if (history.length < MIN_HISTORY || grams < UNUSUAL_FLOOR_GRAMS) return false;
  const m = median(history);
  return (
    m > 0 &&
    grams > UNUSUAL_RATIO * m &&
    grams > percentile(history, UNUSUAL_PERCENTILE)
  );
}

export function buildAnswerCo2(
  turn: TurnTotals,
  history: number[],
  lang: Lang,
): AnswerCo2View {
  const amount = formatGrams(turn.grams, lang);
  if (!isUnusual(turn.grams, history))
    return { main: amount, sub: null, isUnusual: false };
  const ratio = Math.round(turn.grams / median(history));
  const main = `${amount} · ${ratio}× ${lang === "fr" ? "votre médiane" : lang === "ru" ? "ваша медиана" : "your median"}`;
  const share = turn.grams > 0 ? turn.subagentGrams / turn.grams : 0;
  if (turn.subagents === 0 || share < SUBAGENT_SHARE)
    return { main, sub: null, isUnusual: true };
  const n = turn.subagents;
  const grams = formatGrams(turn.subagentGrams, lang);
  const sub =
    lang === "fr"
      ? `dont ${n} sous-agent${n > 1 ? "s" : ""}${NBSP}: ${grams}`
      : lang === "ru"
        ? `вкл. ${n} ${n > 1 ? "субагентов" : "субагент"}: ${grams}`
        : `incl. ${n} subagent${n > 1 ? "s" : ""}: ${grams}`;
  return { main, sub, isUnusual: true };
}

// The single line drawn under the answer where the turn duration line is not
// (the Desktop app): only ever for an unusual answer.
export function answerLine(view: AnswerCo2View): string {
  return view.sub === null
    ? view.main
    : `${view.main} · ${view.sub}`;
}

// Two decimals, as the status line rounds it; "< 0,01 $" under a cent. French puts the
// sign after the number, English before it.
export function formatUsd(usd: number, lang: Lang): string {
  const isTiny = usd < 0.01;
  const amount = decimal(isTiny ? 0.01 : usd, 2, lang);
  const money = lang === "en" ? `$${amount}` : `${amount}${NBSP}$`;
  return isTiny ? `<${NBSP}${money}` : money;
}

// The entry pinned under the prompt. The surface already heads it with the plugin's name.
// The cost is left out when there is none to show (no price list read), never shown as 0.
// What the status line ends with follows, in its order: the quota, then the hints.
export function sessionLine(
  sessionGrams: number,
  lang: Lang,
  sessionUsd: number | null = null,
  ...after: (string | null)[]
): string {
  const fr = lang === "fr";
  const head = fr ? `Cette session${NBSP}:` : lang === "ru" ? `Эта сессия${NBSP}:` : "This session:";
  const total = `${head} ${formatGrams(sessionGrams, lang)}`;
  const cost = sessionUsd !== null && sessionUsd > 0 ? formatUsd(sessionUsd, lang) : null;
  return [total, cost, ...after].filter((part) => part !== null).join(" · ");
}

// The status line's two hints, for the entry: a newer release, and from the 1st to the
// 10th the month just closed with its total
export function updateHint(version: string): string {
  return `⬆ ${version} ${UPDATE_COMMAND}`;
}

const MONTH_NAMES_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function cardHint(month: number, grams: number, lang: Lang): string {
  const fr = lang === "fr";
  const name = (fr ? MONTH_NAMES_FR : MONTH_NAMES_EN)[month] ?? "";
  return `📊 ${name}${fr ? `${NBSP}:` : ":"} ${formatGrams(grams, lang)} · /carbon-card`;
}

// December's: the year so far
export function yearCardHint(year: number, grams: number, lang: Lang): string {
  return `📊 ${year}${lang === "fr" ? `${NBSP}:` : ":"} ${formatGrams(grams, lang)} · /carbon-card`;
}

export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string };

const WEEKDAYS_FR = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

// A subscription's quota as the terminal status line shows it: the 5-hour window, "Usage
// 23 % ↻14:00", or without one (a verified Ultra account has none) the weekly window,
// "Usage 41 % 7j ↻jeu.", its reset as a weekday while more than a day away. Rounded half
// to even like the status line's awk printf "%.0f" (22.5 reads 22 on both), capped at 100,
// the reset in local time; a window whose reset has passed is over. Null off a
// subscription or before the first response has reported a window.
export function quotaText(
  limits: readonly RateLimit[] | undefined,
  lang: Lang,
  now: number = Date.now(),
): string | null {
  const resetOf = (limit: RateLimit) =>
    limit.resetsAt === undefined ? NaN : Date.parse(limit.resetsAt);
  // A reset that does not parse leaves the window open: NaN <= now is false
  const open = (kind: string) =>
    limits?.find(
      (limit) =>
        limit.kind === kind && Number.isFinite(limit.percentUsed) && !(resetOf(limit) <= now),
    );
  const fiveHour = open("five_hour");
  const window = fiveHour ?? open("seven_day");
  if (window === undefined) return null;
  const weekly = fiveHour === undefined;
  const fr = lang === "fr";
  const used = Math.max(0, window.percentUsed);
  const floor = Math.floor(used);
  const rounded =
    used - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(used);
  const percent = Math.min(100, rounded);
  const head =
    (fr ? `Usage ${percent}${NBSP}%` : lang === "ru" ? `Использовано ${percent}${NBSP}%` : `Use ${percent}%`) +
    (weekly ? (fr ? " 7j" : lang === "ru" ? " 7 дн." : " 7d") : "");
  const reset = resetOf(window);
  if (Number.isNaN(reset)) return head;
  const d = new Date(reset);
  if (weekly && reset - now >= DAY_MS) {
    return `${head} ↻${(fr ? WEEKDAYS_FR : WEEKDAYS_EN)[d.getDay()]}`;
  }
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${head} ↻${time}`;
}

// Shown once per machine, the same on every surface.
export function welcomeText(lang: Lang): string {
  return lang === "fr"
    ? "Le CO₂ s'affiche maintenant pour chaque réponse."
    : lang === "ru"
      ? "CO₂ теперь показывается для каждого ответа."
      : "CO₂ now shows for each answer.";
}

export function pushHistory(history: number[], grams: number): number[] {
  if (!(grams > 0)) return history;
  return [...history, grams].slice(-HISTORY_SIZE);
}

// The claude-carbon status line already shows the session total: no second one.
export function isCarbonStatusLine(command: unknown): boolean {
  return (
    typeof command === "string" &&
    command.includes("claude-carbon") &&
    command.includes("statusline.sh")
  );
}

// ── The /carbon-panel pane ──────────────────────────────────────────────────

// The pane's tab: the plugin's name, as the person asked for it
export function paneTitle(_lang: Lang): string {
  return "claude-carbon";
}

export function commandDescription(lang: Lang): string {
  return lang === "fr"
    ? "Votre molécule de CO₂ et l'historique de vos sessions"
    : lang === "ru"
      ? "Ваша молекула CO₂ и история ваших сессий"
      : "Your CO₂ molecule and the history of your sessions";
}

// Shown once per machine to someone already welcomed before the pane existed.
export function paneHint(lang: Lang): string {
  return lang === "fr"
    ? "Tapez /carbon-panel pour voir votre molécule et l'historique de vos sessions."
    : lang === "ru"
      ? "Введите /carbon-panel, чтобы увидеть свою молекулу и историю сессий."
      : "Type /carbon-panel to see your molecule and the history of your sessions.";
}

export function paneUnplaced(lang: Lang): string {
  return lang === "fr"
    ? `Le panneau carbone ne peut pas s'ouvrir ici${NBSP}: élargissez la fenêtre ou mettez Claude Code à jour.`
    : lang === "ru"
      ? "Панель углерода не может открыться здесь: расширьте окно или обновите Claude Code."
      : "The carbon pane cannot open here: widen the window or update Claude Code.";
}

// The molecule's line: the session so far, and its ratio to the median of past sessions.
export function currentLine(
  grams: number,
  sessionMedian: number | null,
  lang: Lang,
): string {
  const fr = lang === "fr";
  const ru = lang === "ru";
  const head = fr ? `Cette session${NBSP}:` : ru ? `Эта сессия${NBSP}:` : "This session:";
  const total = `${head} ${formatGrams(grams, lang)}`;
  if (sessionMedian === null || !(sessionMedian > 0) || !(grams > 0)) return total;
  const r = grams / sessionMedian;
  const ratio =
    r >= 10 ? `${Math.round(r)}` : decimal(r, r >= 1 ? 1 : 2, lang);
  return `${total} · ${ratio}×${NBSP}${fr ? "votre médiane" : ru ? "ваша медиана" : "your median"}`;
}

// Before 10 past sessions the colour compares with a starting reference (0.5 kgCO₂),
// said simply to someone who just arrived
export function colorNote(pastSessions: number, lang: Lang): string {
  return lang === "fr"
    ? `Couleur provisoire${NBSP}: elle s'ajustera à vos habitudes après 10 sessions (${pastSessions} pour l'instant).`
    : lang === "ru"
      ? `Временный цвет: он подстроится под ваши привычки после 10 сессий (сейчас ${pastSessions}).`
      : `Provisional colour: it adjusts to your habits after 10 sessions (${pastSessions} so far).`;
}

// No history file. `missing` names the tools the SessionStart hook found absent (jq,
// sqlite3): without them no database is created.
export function noHistoryText(lang: Lang, missing: string[] | null = null): string {
  if (missing !== null && missing.length > 0) {
    const tools = missing.join(lang === "fr" ? " et " : lang === "ru" ? " и " : " and ");
    return lang === "fr"
      ? `Pour enregistrer vos sessions, installez ${tools} puis relancez Claude Code (voir le README).`
      : lang === "ru"
        ? `Чтобы записывать сессии, установите ${tools} и перезапустите Claude Code (см. README).`
        : `To record your sessions, install ${tools} and restart Claude Code (see the README).`;
  }
  return lang === "fr"
    ? "Aucun historique pour l'instant (voir le README)."
    : lang === "ru"
      ? "Истории пока нет (см. README)."
      : "No history yet (see the README).";
}

// Shown once, to someone whose database the SessionStart hook created by itself
export function autoSetupText(lang: Lang): string {
  return lang === "fr"
    ? "Vos sessions sont maintenant enregistrées sur cette machine, y compris celles déjà sur le disque. Rien n'est envoyé."
    : lang === "ru"
      ? "Ваши сессии теперь записываются на этом компьютере, включая уже имеющиеся на диске. Никуда ничего не отправляется."
      : "Your sessions are now recorded on this machine, including those already on disk. Nothing is sent anywhere.";
}

export function emptyRangeText(lang: Lang): string {
  return lang === "fr"
    ? "Aucune session sur cette période."
    : lang === "ru"
      ? "За этот период сессий нет."
      : "No session in this period.";
}


const RANGE_LABELS: Record<string, [string, string]> = {
  "7d": ["7 j", "7 d"],
  "30d": ["30 j", "30 d"],
  "1y": ["12 mois", "12 months"],
  all: ["Tout", "All"],
  custom: ["Personnalisée", "Custom"],
};
function pick(pair: [string, string] | undefined, lang: Lang): string {
  if (pair === undefined) return "";
  if (lang === "fr") return pair[0];
  if (lang === "ru") return RU_LABELS[pair[1]] ?? pair[1];
  return pair[1];
}

export function rangeLabel(range: string, lang: Lang): string {
  return pick(RANGE_LABELS[range], lang);
}


function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}
function countOf(n: number, step: string, lang: Lang): string {
  if (lang === "ru") {
    if (step === "week") return pluralRu(n, "неделя", "недели", "недель");
    if (step === "month") return pluralRu(n, "месяц", "месяца", "месяцев");
    return pluralRu(n, "сессия", "сессии", "сессий");
  }
  const fr = lang === "fr";
  if (step === "week") return fr ? `${n} semaine${n > 1 ? "s" : ""}` : `${n} week${n > 1 ? "s" : ""}`;
  if (step === "month") return fr ? `${n} mois` : `${n} month${n > 1 ? "s" : ""}`;
  return `${n} session${n > 1 ? "s" : ""}`;
}

// Under the stripes: what one stripe is, and the median their colours measure against
const PER: Record<string, [string, string]> = {
  day: ["jour", "day"],
  week: ["semaine", "week"],
  month: ["mois", "month"],
};
// Before three periods with sessions in them there is nothing to colour: the stripes
// wait, and say what they will show
export function stripesWaitText(step: string, filled: number, lang: Lang): string {
  const fr = lang === "fr";
  const units: Record<string, [string, string]> = {
    day: ["jours", "days"],
    week: ["semaines", "weeks"],
    month: ["mois", "months"],
  };
  const unit = lang === "ru" ? pluralRu(3, pick(units[step], "en"), "", "") : pick(units[step], lang);
  if (lang === "ru") {
    const ruUnits: Record<string, [string, string, string]> = {
      day: ["день", "дня", "дней"],
      week: ["неделю", "недели", "недель"],
      month: ["месяц", "месяца", "месяцев"],
    };
    const u = ruUnits[step] ?? ruUnits.day;
    return `Цветные полосы появятся после 3 ${u[0]} использования (сейчас ${filled}): по одной за период, от синего к красному в зависимости от CO₂.`;
  }
  return fr
    ? `Vos bandes de couleur apparaissent après 3 ${unit} d'usage (${filled} pour l'instant)${NBSP}: une par période, du bleu au rouge selon son CO₂.`
    : `Your colour stripes show after 3 ${unit} of use (${filled} so far): one per period, blue to red by its CO₂.`;
}

export function stripesCaption(step: string, stripeMedian: number | null, lang: Lang): string {
  const fr = lang === "fr";
  const unit = pick(PER[step], lang);
  if (lang === "ru") {
    const one = RU_LABELS[`une bande par ${pick(PER[step], "en")}`] ?? `одна полоса за ${unit}`;
    if (stripeMedian === null) return one;
    return `${one} · медиана ${formatGrams(stripeMedian, lang)}${RU_LABELS[` par ${pick(PER[step], "en")}`] ?? ""}`;
  }
  const one = fr ? `une bande par ${unit}` : `one stripe per ${unit}`;
  if (stripeMedian === null) return one;
  const per = fr ? ` par ${unit}` : ` a ${unit}`;
  return `${one} · ${fr ? "médiane" : "median"} ${formatGrams(stripeMedian, lang)}${per}`;
}

// The period's figure, the pane's main one
export function periodHeadline(grams: number, lang: Lang): string {
  return lang === "fr"
    ? `${formatGrams(grams, lang)} sur la période`
    : lang === "ru"
      ? `${formatGrams(grams, lang)} за период`
      : `${formatGrams(grams, lang)} over the period`;
}

export function sessionsCount(n: number, lang: Lang): string {
  return countOf(n, "session", lang);
}

// The custom range's fields: a date typed day first, or as 2026-05-01
export function datePlaceholder(lang: Lang): string {
  return lang === "en" ? "DD/MM/YYYY" : "ДД/ММ/ГГГГ";
}

export function dateInvalid(lang: Lang): string {
  return lang === "fr"
    ? `Date non reconnue${NBSP}: tapez-la comme 01/05/2026.`
    : lang === "ru"
      ? "Дата не распознана: введите её как 01/05/2026."
      : "Date not recognised: type it as 01/05/2026.";
}

// A day key shown back in its field: "01/05/2026"
export function dayInputValue(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d ?? ""}/${m ?? ""}/${y ?? ""}`;
}

export function fromLabel(lang: Lang): string {
  return lang === "fr" ? "Du" : lang === "ru" ? "С" : "From";
}

export function toLabel(lang: Lang): string {
  return lang === "fr" ? "au" : lang === "ru" ? "по" : "to";
}

export function waitingText(lang: Lang): string {
  return lang === "fr"
    ? `Cette session${NBSP}: en attente de la première réponse`
    : lang === "ru"
      ? "Эта сессия: ожидание первого ответа"
      : "This session: waiting for the first answer";
}



const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_RU = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];

// A day ("22 août", "Aug 22", with the year when asked), or a month for monthly
// stripes ("août 2026", "Aug 2026").
export function dateLabel(
  ms: number,
  step: string,
  lang: Lang,
  withYear = false,
): string {
  const d = new Date(ms);
  const month = (lang === "fr" ? MONTHS_FR : lang === "ru" ? MONTHS_RU : MONTHS_EN)[d.getMonth()] ?? "";
  if (step === "month") return `${month}${NBSP}${d.getFullYear()}`;
  const year = withYear ? `${NBSP}${d.getFullYear()}` : "";
  if (lang === "ru") return `${d.getDate()}${NBSP}${month}${year}`;
  return lang === "fr"
    ? `${d.getDate()}${NBSP}${month}${year}`
    : `${month}${NBSP}${d.getDate()}${withYear ? `,${NBSP}${d.getFullYear()}` : ""}`;
}

// A stripe's tooltip in the desktop app.
export function stripeTitle(
  start: number,
  step: string,
  grams: number,
  sessions: number,
  lang: Lang,
): string {
  const fr = lang === "fr";
  const ru = lang === "ru";
  const when =
    step === "week"
      ? `${fr ? "semaine du" : ru ? "неделя от" : "week of"} ${dateLabel(start, "session", lang)}`
      : dateLabel(start, step, lang);
  const amount = grams > 0 ? formatGrams(grams, lang) : fr ? "aucune session" : ru ? "нет сессий" : "no session";
  return sessions === 0
    ? `${when} · ${amount}`
    : `${when} · ${amount} · ${countOf(sessions, "session", lang)}`;
}

// Against the same length of time just before: "+12 % par rapport aux 30 jours
// d'avant". Nothing when there is nothing before to compare with.
const RU_LABELS: Record<string, string> = {
  "7 d": "7 дней",
  "30 d": "30 дней",
  "12 months": "12 месяцев",
  All: "Всё",
  Custom: "Свой",
  day: "день",
  days: "дней",
  week: "неделя",
  weeks: "недель",
  month: "месяц",
  months: "месяцев",
  "une bande par day": "одна полоса в день",
  "une bande par week": "одна полоса в неделю",
  "une bande par month": "одна полоса в месяц",
  " par day": " в день",
  " par week": " в неделю",
  " par month": " в месяц",
  "Sur la période": "За период",
  "Against before": "Сравнение с прошлым",
  Sessions: "Сессии",
  "API-price value": "Стоимость по API",
  "By car": "На машине",
  Comparison: "Сравнение",
  "API cost": "Стоимость API",
  Equivalence: "Эквивалент",
  Projects: "Проекты",
  Detail: "Подробности",
  Input: "Ввод",
  "Cache write": "Запись кэша",
  "Cache read": "Чтение кэша",
  Output: "Вывод",
  Show: "Показать",
};
const BEFORE: Record<string, [string, string]> = {
  "7d": ["aux 7 jours d'avant", "the 7 days before"],
  "30d": ["aux 30 jours d'avant", "the 30 days before"],
  "1y": ["aux 12 mois d'avant", "the 12 months before"],
  custom: ["à la période d'avant", "the period before"],
};
const RU_BEFORE: Record<string, string> = {
  "the 7 days before": "предыдущими 7 днями",
  "the 30 days before": "предыдущими 30 днями",
  "the 12 months before": "предыдущими 12 месяцами",
  "the period before": "предыдущим периодом",
};

// The change against the period before, in whole percent; null when there is none
export function changePercent(grams: number, previous: number): number | null {
  return previous > 0 ? Math.round(((grams - previous) / previous) * 100) : null;
}
export function compareText(
  grams: number,
  previous: number,
  range: string,
  lang: Lang,
): string | null {
  const before = BEFORE[range];
  const change = changePercent(grams, previous);
  if (before === undefined || change === null) return null;
  const sign = change > 0 ? "+" : change < 0 ? "-" : "";
  const amount = `${sign}${Math.abs(change)}${NBSP}%`;
  return lang === "fr"
    ? `${amount} par rapport ${before[0]}`
    : lang === "ru"
      ? `${amount} по сравнению с ${RU_BEFORE[before[1]] ?? before[1]}`
      : `${amount} vs ${before[1]}`;
}

// ── Model families, as the session block names them ─────

const FAMILY_NAMES: Record<string, string> = {
  fable: "Fable",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
};
export function familyName(f: string): string {
  return FAMILY_NAMES[f] ?? f;
}


// The car factor as the pane prints it, the unit spelled out: "142 gCO₂/km, ADEME 2025"
export function carTag(tag: string): string {
  return tag.replace(/(\d)\s*g\//, `$1${NBSP}gCO₂/`);
}

// A subagent's molecule, on hover: "Sous-agent 2 · 12 gCO₂"
export function subagentTitle(n: number, grams: number, lang: Lang): string {
  return `${lang === "fr" ? "Sous-agent" : lang === "ru" ? "Субагент" : "Subagent"} ${n} · ${formatGrams(grams, lang)}`;
}

export function subagentsAlt(n: number, lang: Lang): string {
  return lang === "fr"
    ? `${n} sous-agent${n > 1 ? "s" : ""} de cette session, une petite molécule chacun, colorée selon son CO₂`
    : lang === "ru"
      ? `${pluralRu(n, "субагент", "субагента", "субагентов")} этой сессии, по одной маленькой молекуле каждого, окрашенной по её CO₂`
      : `${n} subagent${n > 1 ? "s" : ""} of this session, a small molecule each, coloured by its CO₂`;
}

// More subagents than the row shows: "+4"
export function moreAgentsText(n: number): string {
  return `+${n}`;
}

// The context window's fill: "Contexte 42 %"
export function contextText(percentUsed: number, lang: Lang): string {
  const p = `${Math.round(percentUsed)}${NBSP}%`;
  return lang === "fr" ? `Contexte ${p}` : lang === "ru" ? `Контекст ${p}` : `Context ${p}`;
}

// The running session, under its line: "12 réponses · 3 sous-agents · Opus"
export function sessionStatsText(
  answers: number,
  subagents: number,
  f: string | null,
  lang: Lang,
): string {
  const fr = lang === "fr";
  const parts =
    lang === "ru"
      ? [pluralRu(answers, "ответ", "ответа", "ответов"), pluralRu(subagents, "субагент", "субагента", "субагентов")]
      : [
          fr ? `${answers} réponse${answers > 1 ? "s" : ""}` : `${answers} answer${answers > 1 ? "s" : ""}`,
          fr ? `${subagents} sous-agent${subagents > 1 ? "s" : ""}` : `${subagents} subagent${subagents > 1 ? "s" : ""}`,
        ];
  if (f !== null) parts.push(familyName(f));
  return parts.join(" · ");
}

// The pane's last line: who made it, and the version for a team
export const AUTHOR_URL = "https://www.linkedin.com/in/gwittebolle/";
// The French site is at the root; only the English one has a prefix
export function teamUrl(lang: Lang): string {
  return lang === "fr"
    ? "https://tokenclimate.com/?ref=carbon-panel"
    : "https://tokenclimate.com/en?ref=carbon-panel";
}

// The project's home: its README says what the tool does and leads to the methodology
export const REPO_URL = "https://github.com/gwittebolle/claude-carbon";
export function repoLabel(lang: Lang): string {
  return lang === "fr"
    ? "En savoir plus sur claude-carbon"
    : lang === "ru"
      ? "Подробнее о claude-carbon"
      : "Learn more about claude-carbon";
}

// A newer release, at the top of the foot: what to ask Claude, the plugin command
// The one command for every install: the skill updates the plugin, the clone, or both
export const UPDATE_COMMAND = "/carbon-update";
export function updateText(version: string, lang: Lang): string {
  return lang === "fr"
    ? `Version ${version} disponible${NBSP}: tapez ${UPDATE_COMMAND}, puis redémarrez.`
    : lang === "ru"
      ? `Вышла версия ${version}: введите ${UPDATE_COMMAND}, затем перезапустите.`
      : `Version ${version} is out: type ${UPDATE_COMMAND}, then restart.`;
}

// The foot's two credit lines, a label and a colon each, the link after it
export function builtByLabel(lang: Lang): string {
  return lang === "fr" ? `Développé par${NBSP}:` : lang === "ru" ? `Создано:` : "Built by:";
}
export function forTeamLabel(lang: Lang): string {
  return lang === "fr"
    ? `Découvrez la version entreprise${NBSP}:`
    : lang === "ru"
      ? `Корпоративная версия:`
      : "Discover the business version:";
}

export function blockTitle(kind: "session" | "usage", lang: Lang): string {
  if (kind === "session")
    return lang === "fr" ? "Cette session" : lang === "ru" ? "Эта сессия" : "This session";
  return lang === "fr" ? "Mon usage" : lang === "ru" ? "Моё использование" : "My usage";
}

// The tiles at the top of the desktop pane: a label over a figure
const TILE_LABELS: Record<string, [string, string]> = {
  period: ["Sur la période", "Over the period"],
  change: ["Par rapport à avant", "Against before"],
  sessions: ["Sessions", "Sessions"],
  cost: ["Valeur au prix API", "API-price value"],
  car: ["En voiture", "By car"],
};
export function tileLabel(kind: string, lang: Lang): string {
  return pick(TILE_LABELS[kind], lang);
}

// "+29 %", "-18 %"
export function changeValue(change: number): string {
  const sign = change > 0 ? "+" : change < 0 ? "-" : "";
  return `${sign}${Math.abs(change)}${NBSP}%`;
}

// "27 616 $", "$27,616", "12,30 $"
export function moneyValue(usd: number, lang: Lang): string {
  return costText(usd, lang).replace(lang === "fr" ? " au prix API" : lang === "ru" ? " по ценам API" : " at API prices", "");
}

// Under the value tile, so it holds whoever pays: a subscription, an API key, extra
// usage, or sessions of several kinds. Which session was billed how is not recorded.
export function apiValueNote(lang: Lang): string {
  return lang === "fr"
    ? `Le prix de cet usage facturé à l'API${NBSP}; un abonnement Pro, Max ou Ultra en couvre tout ou partie.`
    : lang === "ru"
      ? "Стоимость этого использования при оплате через API; подписка Pro, Max или Ultra покрывает её полностью или частично."
      : "What this usage costs billed through the API; a Pro, Max or Ultra subscription covers some or all of it.";
}

// "12,34 $ au prix API", "$12.34 at API prices"
export function costText(usd: number, lang: Lang): string {
  // Whole dollars from a thousand up, grouped: "27 608 $", "$27,608"
  const money =
    usd >= 1000
      ? lang === "fr"
        ? `${thousands(usd, lang)}${NBSP}$`
        : `$${thousands(usd, lang)}`
      : formatUsd(usd, lang);
  return lang === "fr" ? `${money} au prix API` : lang === "ru" ? `${money} по ценам API` : `${money} at API prices`;
}

function thousands(n: number, lang: Lang): string {
  const whole = String(Math.round(n));
  const sep = lang === "fr" ? NBSP : ",";
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

// "≈ 1 680 km en voiture (142 g/km, ADEME 2025)", the reports' and cards' car line
export function equivalenceText(
  grams: number,
  car: { divisor: number; label: string; tag: string },
  lang: Lang,
): string {
  return `≈${NBSP}${thousands(grams / car.divisor, lang)} ${car.label} (${carTag(car.tag)})`;
}

// The car tile's figure, the period's CO2 in the locale's unit: "≈ 1 684 km"
export function carValue(
  grams: number,
  car: { divisor: number; unit: string },
  lang: Lang,
): string {
  const distance = grams / car.divisor;
  // Under a unit, "≈ 0 km" reads as nothing at all
  if (distance < 1) return `<${NBSP}1 ${car.unit}`;
  return `≈${NBSP}${thousands(distance, lang)} ${car.unit}`;
}

// The blocks a person can show or hide in the pane, under the gear

const BLOCK_LABELS: Record<string, [string, string]> = {
  compare: ["Comparaison", "Comparison"],
  cost: ["Coût API", "API cost"],
  equivalence: ["Équivalence", "Equivalence"],
  projects: ["Projets", "Projects"],
  detail: ["Détail", "Detail"],
};
export function blockLabel(block: string, lang: Lang): string {
  return pick(BLOCK_LABELS[block], lang);
}

// ── The "Détail" block: a period's tokens, energy and CO2 by kind of token ──
const KIND_LABELS: Record<string, [string, string]> = {
  input: ["Entrée", "Input"],
  cacheWrite: ["Cache écrit", "Cache write"],
  cacheRead: ["Cache relu", "Cache read"],
  output: ["Sortie", "Output"],
};
export function kindLabel(kind: string, lang: Lang): string {
  return pick(KIND_LABELS[kind], lang);
}

// Above each bar: what it splits
export function detailBarLabel(bar: "tokens" | "co2", lang: Lang): string {
  if (bar === "tokens") return lang === "ru" ? "Токены" : "Tokens";
  return lang === "fr" ? `${UNIT} et énergie` : lang === "ru" ? `${UNIT} и энергия` : `${UNIT} and energy`;
}

// 820, 12k, 371M, then billions with one decimal: 25,3 Md / 25.3B
export function formatTokens(n: number, lang: Lang): string {
  if (n >= 999.5e6)
    return lang === "fr"
      ? `${decimal(n / 1e9, 1, lang)}${NBSP}Md`
      : lang === "ru"
        ? `${decimal(n / 1e9, 1, lang)}${NBSP}млрд`
        : `${decimal(n / 1e9, 1, lang)}B`;
  const space = lang === "fr" ? NBSP : "";
  if (n >= 999.5e3) return `${Math.round(n / 1e6)}${space}M`;
  if (n >= 1000) return `${Math.round(n / 1e3)}${space}k`;
  return String(Math.round(n));
}

// Wh under a kWh, then kWh (one decimal under 100), then MWh
export function formatWh(wh: number, lang: Lang): string {
  if (wh < 999.5) return `${Math.round(wh)}${NBSP}Wh`;
  const kwh = wh / 1000;
  if (kwh < 99.95) return `${decimal(kwh, 1, lang)}${NBSP}kWh`;
  if (kwh < 999.5) return `${Math.round(kwh)}${NBSP}kWh`;
  return `${decimal(kwh / 1000, 1, lang)}${NBSP}MWh`;
}

// One decimal, "98,4 %", "< 0,1 %" for a share that is there but rounds to nothing,
// "0 %" for none; a space before % in both languages, as the rest of the pane writes it
export function formatShare(share: number, lang: Lang): string {
  if (share <= 0) return `0${NBSP}%`;
  if (share < 0.0005) return `<${NBSP}${decimal(0.1, 1, lang)}${NBSP}%`;
  return `${decimal(share * 100, 1, lang)}${NBSP}%`;
}

// Under a kind's name: "23,8 Md tokens (98,4 %) · 21,6 kWh · 6,2 kgCO₂ (60,9 %)"
export function detailLine(
  part: { tokens: number; tokenShare: number; wh: number; grams: number; gramShare: number },
  lang: Lang,
): string {
  return (
    `${formatTokens(part.tokens, lang)} tokens (${formatShare(part.tokenShare, lang)}) · ` +
    `${formatWh(part.wh, lang)} · ${formatGrams(part.grams, lang)} (${formatShare(part.gramShare, lang)})`
  );
}

export function detailTotalLine(
  total: { tokens: number; wh: number; grams: number },
  lang: Lang,
): string {
  return (
    `${lang === "ru" ? "Всего" : "Total"}${lang === "en" ? "" : NBSP}: ${formatTokens(total.tokens, lang)} ${lang === "ru" ? "токенов" : "tokens"} · ` +
    `${formatWh(total.wh, lang)} · ${formatGrams(total.grams, lang)}`
  );
}

// What a hovered part of a bar says: its kind, its figures on that bar, its share
// "Cache relu · 23,9 Md tokens · 98,4 %", "Cache relu · 535 kWh · 153,5 kgCO₂ · 60,9 %"
export function detailHover(
  part: { kind: string; tokens: number; tokenShare: number; wh: number; grams: number; gramShare: number },
  bar: "tokens" | "co2",
  lang: Lang,
): string {
  const name = kindLabel(part.kind, lang);
  return bar === "tokens"
    ? `${name} · ${formatTokens(part.tokens, lang)} ${lang === "ru" ? "токенов" : "tokens"} · ${formatShare(part.tokenShare, lang)}`
    : `${name} · ${formatWh(part.wh, lang)} · ${formatGrams(part.grams, lang)} · ${formatShare(part.gramShare, lang)}`;
}

// The methodology, straight from the detail
export const METHODOLOGY_URL =
  "https://github.com/gwittebolle/claude-carbon/blob/main/METHODOLOGY.md#the-panes-detail-by-kind-of-token";
export function methodologyLabel(lang: Lang): string {
  return lang === "fr"
    ? "Lire la méthodologie"
    : lang === "ru"
      ? "Прочитать методологию"
      : "Read the methodology";
}

// When some sessions of the period are left out: stored with older factors, or the
// running one before its first answer
export function detailCoverage(n: number, total: number, lang: Lang): string {
  return lang === "fr"
    ? `Sur ${n} des ${total} sessions de la période${NBSP}: les autres ont été enregistrées avec des facteurs plus anciens.`
    : lang === "ru"
      ? `Из ${pluralRu(total, "сессии", "сессий", "сессий")} за период учтено ${n}: остальные записаны с более старыми коэффициентами.`
      : `Over ${n} of the period's ${total} sessions: the others were recorded with older factors.`;
}

// Before the hook has written the tokens by kind: after the next answer
export function detailWaitText(lang: Lang): string {
  return lang === "fr"
    ? "Le détail s'affichera après la prochaine réponse."
    : lang === "ru"
      ? "Подробности появятся после следующего ответа."
      : "The detail shows after the next answer.";
}

export function detailAlt(bar: "tokens" | "co2", lang: Lang): string {
  return lang === "fr"
    ? `Répartition ${bar === "tokens" ? "des tokens" : `du ${UNIT}`} entre entrée, cache écrit, cache relu et sortie`
    : lang === "ru"
      ? `Доля ${bar === "tokens" ? "токенов" : UNIT} между вводом, записью кэша, чтением кэша и выводом`
      : `Share of the ${bar === "tokens" ? "tokens" : UNIT} between input, cache write, cache read and output`;
}

export function showLabel(lang: Lang): string {
  return lang === "fr" ? "Afficher" : lang === "ru" ? "Показать" : "Show";
}


// The button that puts /carbon-card in the prompt, for the person to send. The card
// covers the calendar year so far (the one just ended, over the first days of January),
// whatever range the pane shows: the label says which.
export function cardButtonLabel(year: number, lang: Lang): string {
  return lang === "fr"
    ? `Obtenir ma carte ${year}`
    : lang === "ru"
      ? `Получить мою карту за ${year} год`
      : `Get my ${year} card`;
}

// After the button filled the prompt: what is there and what to do
export function cardReadyText(lang: Lang): string {
  return lang === "fr"
    ? `/carbon-card est dans le prompt${NBSP}: appuyez sur Entrée pour créer la carte.`
    : lang === "ru"
      ? "/carbon-card уже в строке ввода: нажмите Enter, чтобы создать карту."
      : "/carbon-card is in the prompt: press Enter to make the card.";
}

// The prompt could not take it (a dialog is open, or no prompt box here)
export function cardFillFailed(lang: Lang): string {
  return lang === "fr"
    ? `Le prompt n'a pas pu recevoir /carbon-card${NBSP}: tapez-le vous-même.`
    : lang === "ru"
      ? "Не удалось вставить /carbon-card в строку ввода: введите её сами."
      : "The prompt could not take /carbon-card: type it yourself.";
}

// When the prompt already holds a draft, the button leaves it alone and says why
export function cardDraftBusy(lang: Lang): string {
  return lang === "fr"
    ? `Le prompt contient déjà un brouillon${NBSP}: videz-le pour obtenir la carte.`
    : lang === "ru"
      ? "В строке ввода уже есть черновик: очистите её, чтобы получить карту."
      : "The prompt already holds a draft: clear it to get the card.";
}


function percent(share: number): string {
  const p = Math.round(share * 100);
  return p < 1 ? `<${NBSP}1${NBSP}%` : `${p}${NBSP}%`;
}


// A project as a bar, left-aligned so bars compare whatever the font:
// "███████ 41 % carbonara · 103,5 kgCO₂"
export function projectBarLine(
  project: string,
  grams: number,
  share: number,
  lang: Lang,
): string {
  const name = project === "" ? (lang === "fr" ? "sans projet" : lang === "ru" ? "без проекта" : "no project") : project;
  const bar = "█".repeat(Math.max(1, Math.round(share * 16)));
  return `${bar} ${percent(share)} ${name} · ${formatGrams(grams, lang)}`;
}

// The rest after the projects listed
export function otherProjectsLine(count: number, grams: number, share: number, lang: Lang): string {
  const fr = lang === "fr";
  const label =
    lang === "ru"
      ? `ещё ${pluralRu(count, "проект", "проекта", "проектов")}`
      : fr
        ? `${count} autre${count > 1 ? "s" : ""} projet${count > 1 ? "s" : ""}`
        : `${count} other project${count > 1 ? "s" : ""}`;
  return `${label} · ${formatGrams(grams, lang)} · ${percent(share)}`;
}

export function mascotAlt(lang: Lang): string {
  return lang === "fr"
    ? "Molécule de CO₂ en pixels, colorée selon cette session par rapport à votre médiane, du bleu (en dessous) au rouge (au-dessus)"
    : lang === "ru"
      ? "Пиксельная молекула CO₂, окрашенная по этой сессии относительно вашей медианы: от синего (ниже) до красного (выше)"
      : "Pixel CO₂ molecule, coloured by this session against your median, from blue (below) to red (above)";
}

// The scale under the molecule, read aloud: where this session sits on it
export function scaleAlt(cls: number | null, lang: Lang): string {
  const fr = lang === "fr";
  if (cls === null)
    return fr
      ? "Échelle des couleurs, du bleu (sous votre médiane) au rouge (au-dessus)"
      : lang === "ru"
        ? "Цветовая шкала: от синего (ниже вашей медианы) до красного (выше)"
        : "Colour scale, from blue (under your median) to red (over it)";
  return fr
    ? `Échelle des couleurs, du bleu au rouge : cette session est en ${cls + 1}e position sur 8`
    : lang === "ru"
      ? `Цветовая шкала от синего к красному: эта сессия занимает ${cls + 1}-е место из 8`
      : `Colour scale, from blue to red: this session is ${cls + 1} of 8`;
}

export function stripesAlt(lang: Lang): string {
  return lang === "fr"
    ? "Une bande par période, la plus ancienne à gauche, du bleu (sous la médiane) au rouge (au-dessus)"
    : lang === "ru"
      ? "Одна полоса за период, самая старая слева, от синего (ниже медианы) до красного (выше)"
      : "One stripe per period, oldest on the left, from blue (below the median) to red (above)";
}

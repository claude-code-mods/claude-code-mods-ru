document.addEventListener('DOMContentLoaded', () => {
  const page = document.getElementById('page')
  const holder = document.getElementById('compare-data')
  const raw = (holder ? holder.textContent : '').trim()
  const COLUMN_MIN_PX = 184
  const PRE_FRAME_PX = 30
  const PREVIEW_GAP_PX = 16

  function h(tag, props, ...kids) {
    const el = document.createElement(tag)
    for (const [name, value] of Object.entries(props || {})) {
      if (value === null || value === undefined || value === false) continue
      el.setAttribute(name, value === true ? '' : String(value))
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false || kid === '') continue
      el.append(kid instanceof Node ? kid : String(kid))
    }
    return el
  }
  const text = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
  const list = v => (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v])
  const keyOf = name => text(name).toLowerCase().replace(/\s+/g, ' ')
  const inline = s => s.split(/`([^`\n]+)`/).map((part, i) => (i % 2 === 1 ? h('code', null, part) : part))

  function fail(message) {
    page.replaceChildren(h('p', { class: 'problems' }, message))
  }
  if (!raw) return fail('На этой странице нет данных сравнения. Добавьте их как JSON после последней строки файла.')
  let data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    return fail(`Данные сравнения не являются корректным JSON: ${e.message}`)
  }
  if (!data || typeof data !== 'object') return fail('Данные сравнения не являются объектом JSON.')

  const problems = []
  const measures = list(data.measures).filter(m => m && typeof m === 'object')
  const previews = list(data.previews).filter(p => p && typeof p === 'object')
  let choices = list(data.choices)
    .map(c => (typeof c === 'string' ? { name: c } : c && typeof c === 'object' ? c : {}))
    .map(c => ({ name: text(c.name), summary: text(c.summary) }))
    .filter(c => c.name)
  if (choices.length === 0) {
    problems.push('В данных не перечислены варианты.')
    const seen = new Map()
    for (const m of measures)
      for (const name of Object.keys(m.values || {})) if (!seen.has(keyOf(name))) seen.set(keyOf(name), name)
    choices = [...seen.values()].map(name => ({ name: text(name), summary: '' }))
  }
  const byKey = new Map(choices.map(c => [keyOf(c.name), c]))
  function choiceNamed(name, where) {
    const choice = byKey.get(keyOf(name))
    if (!choice && text(name)) problems.push(`«${text(name)}», ${where}, не является одним из вариантов.`)
    return choice
  }

  const question = text(data.question)
  const pick = text(data.pick) ? choiceNamed(data.pick, 'the pick') : undefined
  const pickName = pick ? pick.name : text(data.pick)
  const before = text(data.pickBefore)
  const isSamePick = before && keyOf(before) === keyOf(pickName)
  const isPick = choice => keyOf(choice.name) === keyOf(pickName)
  document.title = question.replace(/`/g, '') || 'Сравнение'

  const measureName = (m, i) => text(m.name) || `Показатель ${i + 1}`
  const bestSets = measures.map((m, i) => {
    const where = `назван лучшим по «${measureName(m, i)}»`
    return new Set(
      list(m.best)
        .map(name => choiceNamed(name, where))
        .filter(Boolean)
        .map(c => keyOf(c.name)),
    )
  })
  measures.forEach((m, i) => {
    for (const name of Object.keys(m.values || {})) choiceNamed(name, `упомянут в значениях «${measureName(m, i)}»`)
  })
  previews.forEach((p, i) => {
    for (const name of Object.keys(p.texts || {})) choiceNamed(name, `упомянут в предпросмотре «${text(p.title) || i + 1}»`)
  })
  const judgedSets = bestSets.filter(s => s.size > 0)

  const tag = () => h('span', { class: 'tag' }, 'Выбор')
  const better = m => text(m.better) && h('span', { class: 'better' }, ` (${text(m.better)})`)
  function tally(choice) {
    if (judgedSets.length === 0) return null
    const won = judgedSets.filter(s => s.has(keyOf(choice.name))).length
    return h('p', { class: 'tally' }, 'Лучший по ', h('b', null, won), ` из ${judgedSets.length} показателей`)
  }
  function result(m, i, choice) {
    const entry = Object.entries(m.values || {}).find(([name]) => keyOf(name) === keyOf(choice.name))
    const raw = entry ? entry[1] : undefined
    const isObject = raw && typeof raw === 'object'
    const value = isObject ? text(raw.value) : text(raw)
    const note = isObject ? text(raw.note) : ''
    const isBest = bestSets[i].has(keyOf(choice.name))
    return [
      value
        ? h(
            'p',
            { class: isBest ? 'value is-best' : 'value' },
            inline(value),
            isBest && h('span', { class: 'best' }, 'Лучший'),
          )
        : h('p', { class: 'value is-empty' }, 'Не измерено'),
      note && h('p', { class: 'note' }, inline(note)),
    ]
  }

  const verdict = h(
    'header',
    { class: 'verdict' },
    question && h('h1', { class: 'question' }, inline(question)),
    pickName ? h('p', { class: 'pick' }, pickName, tag()) : h('p', { class: 'pick is-missing' }, 'Нет выбора'),
    before &&
      pickName &&
      h(
        'p',
        { class: 'change' },
        isSamePick ? 'Тот же выбор, что и до сравнения.' : `До сравнения выбором был ${before}.`,
      ),
    text(data.reason) && h('p', { class: 'reason' }, inline(text(data.reason))),
    text(data.unexpected) && h('p', { class: 'odd' }, h('strong', null, 'Неожиданно: '), inline(text(data.unexpected))),
  )

  const headRows = 3
  const stuckMark = h('div', { class: 'stuck-mark', style: 'grid-column: 1; grid-row: 1', 'aria-hidden': 'true' })
  const pickColumn = choices.findIndex(isPick) + 1
  const matrix = h(
    'section',
    {
      class: 'matrix',
      'aria-label': 'Варианты',
      style: `grid-template-columns: repeat(${choices.length}, minmax(0, 1fr)); grid-template-rows: repeat(${headRows + 2 * measures.length}, auto)`,
    },
    pickColumn > 0 && h('div', { class: 'band', style: `grid-column: ${pickColumn}; grid-row: 1 / ${headRows + 1}` }),
    stuckMark,
    choices.map((choice, c) => [
      h(
        'h2',
        { class: isPick(choice) ? 'col-name is-pick' : 'col-name', style: `grid-column: ${c + 1}; grid-row: 1` },
        choice.name,
        isPick(choice) && tag(),
      ),
      h(
        'div',
        { class: 'col-summary', style: `grid-column: ${c + 1}; grid-row: 2` },
        choice.summary && h('p', { class: 'summary' }, inline(choice.summary)),
      ),
      h('div', { class: 'col-tally', style: `grid-column: ${c + 1}; grid-row: 3` }, tally(choice)),
    ]),
    measures.map((m, i) => [
      h(
        'h3',
        { class: 'm-head', style: `grid-column: 1 / -1; grid-row: ${headRows + 1 + 2 * i}` },
        inline(measureName(m, i)),
        better(m),
      ),
      choices.map((choice, c) =>
        h(
          'div',
          { class: 'cell', style: `grid-column: ${c + 1}; grid-row: ${headRows + 2 + 2 * i}` },
          h('span', { class: 'sr' }, `${choice.name}: `),
          result(m, i, choice),
        ),
      ),
    ]),
  )
  const columnsFit = h(
    'style',
    null,
    `@container page (min-width: ${choices.length * COLUMN_MIN_PX}px) {
      .matrix { display: grid; }
      .cards { display: none; }
    }`,
  )

  const cards = h(
    'section',
    { class: 'cards', 'aria-label': 'Варианты' },
    choices.map(choice =>
      h(
        'article',
        { class: isPick(choice) ? 'card is-pick' : 'card' },
        h(
          'div',
          { class: 'card-head' },
          h('h2', null, choice.name, isPick(choice) && tag()),
          choice.summary && h('p', { class: 'summary' }, inline(choice.summary)),
          tally(choice),
        ),
        measures.map((m, i) =>
          h(
            'div',
            { class: 'row' },
            h('p', { class: 'label' }, inline(measureName(m, i)), better(m)),
            result(m, i, choice),
          ),
        ),
      ),
    ),
  )

  const probe = h('span', { class: 'mono-probe' }, '0'.repeat(100))
  document.body.append(probe)
  const monoCharPx = probe.getBoundingClientRect().width / 100
  probe.remove()
  const previewRowsFit = []
  const previewSection =
    previews.length > 0 &&
    h(
      'section',
      { class: 'previews', 'aria-label': 'Предпросмотры' },
      previews.map((p, i) => {
        const blocks = choices
          .map(choice => {
            const entry = Object.entries(p.texts || {}).find(([name]) => keyOf(name) === keyOf(choice.name))
            return entry && typeof entry[1] === 'string' ? { choice, body: entry[1].replace(/\s+$/, '') } : null
          })
          .filter(Boolean)
        const widest = Math.max(20, ...blocks.flatMap(b => b.body.split('\n').map(line => line.length)))
        const blockPx = Math.min(widest, 100) * monoCharPx + PRE_FRAME_PX
        const rowPx = Math.ceil(blocks.length * blockPx + (blocks.length - 1) * PREVIEW_GAP_PX)
        previewRowsFit.push(
          `@container page (min-width: ${rowPx}px) {
            #preview-${i} .preview-grid { grid-template-columns: repeat(${blocks.length}, minmax(0, 1fr)); }
          }`,
        )
        return h(
          'div',
          { class: 'preview-group', id: `preview-${i}` },
          h('h2', null, inline(text(p.title) || 'Предпросмотр')),
          text(p.note) && h('p', null, inline(text(p.note))),
          h(
            'div',
            { class: 'preview-grid' },
            blocks.map(b =>
              h(
                'figure',
                { class: 'preview' },
                h('figcaption', null, b.choice.name, isPick(b.choice) && tag()),
                h('pre', null, b.body),
              ),
            ),
          ),
        )
      }),
    )

  const caveats = list(data.caveats).map(text).filter(Boolean)
  const method = list(data.method).map(text).filter(Boolean)
  const folds =
    (caveats.length > 0 || method.length > 0) &&
    h(
      'section',
      { class: 'folds' },
      caveats.length > 0 &&
        h(
          'details',
          null,
          h('summary', null, 'Оговорки', h('span', { class: 'count' }, caveats.length)),
          h(
            'ul',
            null,
            caveats.map(c => h('li', null, inline(c))),
          ),
        ),
      method.length > 0 &&
        h(
          'details',
          null,
          h('summary', null, 'Как сравнивались варианты'),
          method.map(p => h('p', null, inline(p))),
        ),
    )

  const problemNote =
    problems.length > 0 &&
    h(
      'div',
      { class: 'problems', role: 'note' },
      h('p', null, 'Проблемы в данных сравнения:'),
      h(
        'ul',
        null,
        problems.map(p => h('li', null, p)),
      ),
    )

  document.head.append(columnsFit, h('style', null, previewRowsFit.join('\n')))
  page.replaceChildren(verdict, problemNote || '', matrix, cards, previewSection || '', folds || '')
  new IntersectionObserver(([entry]) => {
    matrix.classList.toggle('is-stuck', !entry.isIntersecting && entry.boundingClientRect.top < 0)
  }).observe(stuckMark)
})

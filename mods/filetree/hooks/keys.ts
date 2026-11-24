import type { RowSpec } from './rows'

export type ShortcutKey = { key: string; label: string; terminal?: true }
export type ShortcutGroup = { title: string; keys: ShortcutKey[] }

const GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Перемещение',
    keys: [
      { key: 'j / k', label: 'вниз / вверх' },
      { key: 'h / l', label: 'свернуть или к родителю / развернуть' },
      { key: 'o, Enter', label: 'открыть файл или переключить папку' },
      { key: 'z', label: 'перейти к папке' },
      { key: 'Space', label: 'Quick Look в macOS', terminal: true },
    ],
  },
  {
    title: 'Поиск',
    keys: [
      { key: 's', label: 'фокус на поиске' },
      { key: 'i', label: 'искать в папке под курсором' },
      { key: 'c / r', label: 'учёт регистра / регулярное выражение' },
      { key: 'q', label: 'искать по содержимому файлов, а не по именам' },
    ],
  },
  {
    title: 'Файлы и действия',
    keys: [
      { key: 'd', label: 'differences (изменения)' },
      { key: 'click', label: 'выбрать одну строку' },
      { key: 'ctrl+click', label: 'добавить или убрать строку; alt+click в macOS' },
      { key: 'shift+click', label: 'выбрать диапазон от опорной строки' },
      { key: 'shift+j / k', label: 'расширить выделение вниз / вверх' },
      { key: 'v / V', label: 'добавить или убрать строку / снять отметки' },
      { key: 'y / Y', label: 'копировать относительный / абсолютный путь' },
      { key: 'u', label: 'копировать имя' },
      { key: 't', label: 'открыть оболочку в панели tmux или herdr' },
      { key: 'x', label: 'защитить от изменений Claude' },
      { key: 'w', label: 'файлы, записанные вне репозитория' },
    ],
  },
  {
    title: 'Вид',
    keys: [
      { key: 'p', label: 'предпросмотр или карта размеров', terminal: true },
      { key: 'f / b', label: 'листать предпросмотр', terminal: true },
      { key: '[ / ]', label: 'предыдущая / следующая страница PDF или Word', terminal: true },
      { key: 'a', label: 'автосворачивание' },
      { key: 'n / g / m', label: 'сортировка по имени / git / значению' },
    ],
  },
  {
    title: 'Панель',
    keys: [
      { key: '?', label: 'показать или скрыть этот список', terminal: true },
      { key: 'ctrl+x tab', label: 'передать клавиатуру панели', terminal: true },
      { key: 'alt+l', label: 'передать клавиатуру дереву', terminal: true },
      { key: 'alt+h', label: 'вернуться к полю ввода', terminal: true },
      { key: '/filetree keys', label: 'настроить alt+l и alt+h', terminal: true },
      { key: 'Esc', label: 'вернуться к полю ввода', terminal: true },
    ],
  },
]

export const SCROLL_KEYS: ReadonlySet<string> = new Set(['up', 'down', 'j', 'k', 'pageup', 'pagedown', 'f', 'b', 'home', 'end'])

export function shortcutGroups(desktop: boolean): ShortcutGroup[] {
  return GROUPS.map(g => ({ title: g.title, keys: g.keys.filter(k => !desktop || !k.terminal) })).filter(g => g.keys.length > 0)
}

export function shortcutRows(accent: string, muted: string): RowSpec[] {
  const groups = shortcutGroups(false)
  const width = Math.max(...groups.flatMap(g => g.keys.map(k => k.key.length))) + 2
  const rows: RowSpec[] = [{ id: '', left: [{ t: ' Горячие клавиши', b: true, c: accent }], right: [{ t: '? закрывает ', c: muted }] }]
  for (const g of groups) {
    rows.push({ id: '', left: [{ t: ' ' }], right: [] })
    rows.push({ id: '', left: [{ t: ` ${g.title}`, b: true }], right: [] })
    for (const k of g.keys) rows.push({ id: '', left: [{ t: `   ${k.key.padEnd(width)}`, c: accent }, { t: k.label }], right: [] })
  }
  return rows
}

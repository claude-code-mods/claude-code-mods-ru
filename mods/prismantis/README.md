# prismantis

Мод Claude Code, который перерисовывает ответы Claude цветными: таблицы, заголовки, списки, цитаты, подсвеченный код, числа, пути и ссылки, диаграммы и графики mermaid, а также строки инструментов — в 17 темах с кнопками копирования. Выполните `/prismantis setup`, чтобы выбрать вид, или `/prismantis demo`, чтобы увидеть всё, что он рисует.

Снимки экрана, все параметры и журнал изменений — в [полном README](https://github.com/NahumLitvin/prismantis#readme).

## Что он запускает, читает и меняет

Prismantis не выполняет сетевые запросы. Всё ниже происходит только на вашем компьютере.

- **Программы.** При клике `⧉ html` или `▣ png` запускается помощник буфера обмена со скопированной таблицей, диаграммой или рисунком на стандартном вводе: `osascript` в macOS, `powershell.exe` в Windows (путь находится через `SystemRoot`) или `copyq` в Linux. При включенном `latex` из вашего `PATH` запускается `ratex-render` с формулами ответа на стандартном вводе. Больше ничего не запускается.
- **Файлы.** Читается локальный PNG, на который ответ ссылается как изображение Markdown, размером до 2 МБ, чтобы нарисовать его в kitty или Ghostty. Также считываются PNG, записанные `ratex-render` в `$TMPDIR/prismantis-latex-<session>-<id>`. Сам мод файлы не записывает.
- **Настройки.** `/prismantis setup` и `/prismantis theme` сохраняют выбор через `/config` только в собственных параметрах prismantis (`prismantis.theme`, `prismantis.tableStyle` и остальные шаги настройки). Другие настройки не меняются.
- **Цвета десктопного приложения.** Только при `desktopColors` = `match`: в начале сеанса и при `/prismantis theme` мод задает цвета десктопного приложения для сеанса через `$.theme.set` из текущей палитры. Возврат `desktopColors` к `off` один раз вызывает `$.theme.clear()`. В начале сеанса и при перезагрузке очистки не происходит.
- **Хуки.** Отрисовка идет через `ui.render`, ответ на команду `/prismantis` — через `command.run`, отслеживание собственной строки `desktopColors` — в `config.set`, добавление [подсказок для диаграмм](https://github.com/NahumLitvin/prismantis#diagram-hints) (только для модели) и, при включенном `keyPointHint`, заметки о ключевых моментах — в `prompt.submit`, а добавление `$.prismantis.markdown` для [других модов](https://github.com/NahumLitvin/prismantis#other-mods) — в `engine.create`. `prismantis.markdown` — собственное событие этого вызова.

## Лицензия

[MIT](LICENSE), автор Nahum Litvin. Сторонний код и палитры указаны в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Источник и лицензия

- Оригинальный автор: NahumLitvin
- Оригинальный репозиторий: https://github.com/NahumLitvin/prismantis
- Лицензия: MIT
- Русский перевод и локализация интерфейса: проект claude-code-mods-ru

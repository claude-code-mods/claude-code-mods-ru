# Плагин terminal-browser для Claude Code

> Этот плагин экспериментальный, у него есть [известные ограничения](#caveats)




https://github.com/user-attachments/assets/a79e7667-6fcb-49a4-9967-44d0f942102c



## Установка

Установите terminal-browser
```
curl -fsSL https://terminal-browser.sh/install | bash # or brew install terminal-browser
```

Убедитесь, что у вас установлена последняя версия claude code.
```
claude update
```

Включите пользовательский интерфейс плагинов Claude Code, добавив следующее в `~/.claude/settings.json`:
```json
{
  "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" }
}
```




Установите плагин terminal-browser
```
# set the marketplace
claude plugin marketplace add zenbu-labs/terminal-browser

# install the plugin
claude plugin install terminal-browser@terminal-browser
```

Теперь вы можете запустить «/browser» в claude code, чтобы открыть браузер.

### Обновление

Обновите плагин Claude Code
```
claude plugin update terminal-browser@terminal-browser
```

Обновите terminal-browser
```
terminal-browser upgrade
```

### Настройка

Вы можете настроить плагин terminal-browser так, чтобы он включал инструмент, с помощью которого Claude может открывать браузер. По умолчанию функция отключена, поскольку Claude уже может использовать CLI `terminal-browser` для открытия браузера внутри терминала через разделённую панель. Включите инструмент, добавив следующее в свой `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "terminal-browser@terminal-browser": {
      "options": {
        "agentTool": true
      }
    }
  }
}
```


## API плагина terminal-browser

Плагин terminal-browser поставляется с API, который можно использовать в другом плагине Claude Code для программного открытия браузера и загрузки URL. Вот несколько примеров полезных плагинов, которые можно создать с помощью этой функции:
- Слэш-команда `/tldraw`, которая открывает tldraw на разделённой панели Claude Code
- Слэш-команда `/open-pr`, которая открывает PR, связанный с веткой, над которой вы работаете

```typescript
export type BrowserOpenInput = { url?: string }

export type BrowserOpenResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export type Browser = {
  open: (input: BrowserOpenInput) => Promise<BrowserOpenResult>
  close: (input?: Record<string, never>) => Promise<boolean>
}

// usage: in your plugin's hooks module
on('command.run', { command: 'tldraw' }, async ($) => {
  const result = await $.browser.open({ url: 'https://www.tldraw.com/' })
  return { text: result.ok ? 'Opened tldraw' : result.error }
})
```

## Как это работает?

terminal-browser использует [графический протокол kitty] для отображения пикселей, сгенерированных настоящим браузером, внутри терминала. Чтобы показывать браузер внутри Claude Code, мы используем новый [function hooks API](https://github.com/anthropics/claude-code/issues/91870) от Claude Code.

Внутренние компоненты terminal-browser выделены в библиотеку JavaScript — https://github.com/zenbu-labs/terminal-browser/tree/main/pixel — на случай, если вы захотите создать собственное графическое приложение внутри Claude Code/терминала.


## Поддерживаемые терминалы

Плагин terminal-browser для Claude Code будет работать только в терминалах, которые поддерживают [графический протокол kitty] и реализуют [kitty unicode placeholders](https://sw.kovidgoyal.net/kitty/graphics-protocol/#unicode-placeholders). Наиболее популярные терминалы с этой функцией:
- [ghostty](https://ghostty.org)
- [kitty](https://sw.kovidgoyal.net/kitty/)

Если ваш терминал не поддерживает необходимые функции, попытка открыть браузер внутри claude code может привести к искажению TUI.

Кроме того, эту функцию будут поддерживать все терминалы, созданные на основе libghostty. Вот некоторые примеры:
- [cmux](https://cmux.com/)
- [supacode](https://supacode.sh/)

Больше терминалов на базе libghostty можно найти здесь: [awesome-libghostty](https://github.com/Uzaaft/awesome-libghostty)

Даже если ваш терминал поддерживает нужную графическую функцию, при использовании мультиплексора плагин может не работать: мультиплексоры переписывают вывод программ терминала и нарушают графические команды. Поддержка tmux появится в ближайшее время (терминальный браузер сейчас работает в tmux, но пока не через плагин Claude Code), а в herdr работа через плагин Claude Code пока очень медленная, но, вероятно, скоро улучшится. Другие мультиплексоры я не тестировал: если что-то не работает, создайте тикет, и я посмотрю, можно ли добавить поддержку.




## Ограничения:
- зависит от того, поддерживает ли ваш терминал [графический протокол kitty]
- Иногда позиция мыши будет немного смещена, поскольку код Claude не поддерживает передачу координат мыши в пикселях.
- plugin должен отправлять запросы на получение данных на локальный HTTP-сервер для связи с CLI терминала-браузера, что может привести к появлению в вашей ОС сообщения о том, что ваш терминал хочет получить доступ к локальной сети
- Claude Code устанавливает очень большую минимальную ширину для области чата, поэтому иногда невозможно изменить размер окна браузера до нужного значения.
- плагин зависит от экспериментальной функции hooks API Claude Code, которая нестабильна, поэтому плагин может перестать работать между выпусками

[графический протокол kitty]: https://sw.kovidgoyal.net/kitty/graphics-protocol/

## Источник и лицензия

- Оригинальный автор: zenbu-labs
- Оригинальный репозиторий: https://github.com/zenbu-labs/terminal-browser
- Лицензия: MIT
- Русский перевод и локализация интерфейса: проект claude-code-mods-ru

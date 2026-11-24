# terminal-browser claude code plugin

> This plugin is experimental and does have some [known limitations](#caveats)




https://github.com/user-attachments/assets/a79e7667-6fcb-49a4-9967-44d0f942102c



## Установкаation

Установите terminal-browser
```
curl -fsSL https://terminal-browser.sh/install | bash # or brew install terminal-browser
```

Убедитесь, что у вас установлена последняя версия claude code.
```
claude update
```

Включите пользовательский интерфейс claude code plugins, добавив следующее в `~/.claude/settings.json`:
```json
{
  "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" }
}
```




Установите terminal-browser plugin
```
# set the marketplace
claude plugin marketplace add zenbu-labs/terminal-browser

# install the plugin
claude plugin install terminal-browser@terminal-browser
```

Теперь вы можете запустить «/browser» в claude code, чтобы открыть браузер.

### Updating

Обновите claude code plugin
```
claude plugin update terminal-browser@terminal-browser
```

Обновите terminal-browser
```
terminal-browser upgrade
```

### Configuration

Вы можете настроить терминальный браузер plugin так, чтобы он включал инструмент, с помощью которого Claude может открывать браузер. По умолчанию эта функция отключена, поскольку Claude уже может использовать CLI `terminal-browser` для открытия браузера внутри терминала через разделенную панель. Вы можете включить инструмент, добавив следующее в свой ` ~/.claude/settings.json`:

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


## terminal-browser plugin API

Терминальный браузер plugin поставляется с API, который можно использовать в другом plugin claude code, чтобы программно открывать браузер и загружать URL. Вот несколько примеров полезных plugins, которые можно создать с помощью этой функции:
- Слэш-команда `/tldraw`, которая открывает tldraw на разделенной панели claude code
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

## How does it work?

terminal-browser использует [графический протокол kitty] для отображения пикселей, сгенерированных реальным браузером, внутри терминала. Для отображения браузера внутри claude code мы используем новый [function hooks API](https://github.com/anthropics/claude-code/issues/91870) от claude code.

Внутренние компоненты terminal-browser были выделены в библиотеку JavaScript — https://github.com/zenbu-labs/terminal-browser/tree/main/pixel — на случай, если вы захотите создать собственное графическое приложение внутри claude code/терминала.


## Supported terminals

Терминальный браузер claude code plugin будет работать только в терминалах, которые поддерживают [графический протокол kitty] и реализуют [kitty unicode placeholders](https://sw.kovidgoyal.net/kitty/graphics-protocol/#unicode-placeholders). Наиболее популярные терминалы, поддерживающие эту функцию:
- [ghostty](https://ghostty.org)
- [kitty](https://sw.kovidgoyal.net/kitty/)

Если ваш терминал не поддерживает необходимые функции, попытка открыть браузер внутри claude code может привести к искажению TUI.

Кроме того, эту функцию будут поддерживать все терминалы, созданные на основе libghostty. Вот некоторые примеры:
- [cmux](https://cmux.com/)
- [supacode](https://supacode.sh/)

Больше терминалов на основе libghostty можно найти здесь: [awesome-libghostty](https://github.com/Uzaaft/awesome-libghostty)

Даже если ваш терминал поддерживает требуемую графическую функцию, при использовании мультиплексора plugin может не работать. Это связано с тем, что мультиплексоры переписывают вывод программ терминала и нарушают работу графических команд терминала. Поддержка tmux появится в ближайшее время (браузер терминала в настоящее время работает в tmux, но пока не через код claude plugin), а в herdr производительность при выполнении через код claude plugin очень низкая, но, вероятно, скоро улучшится. Другие мультиплексоры я не тестировал, поэтому, если что-то не работает, пожалуйста, создайте тикет, и я посмотрю, сможем ли мы обеспечить поддержку.




## Caveats:
- зависит от того, поддерживает ли ваш терминал [графический протокол kitty]
- Иногда позиция мыши будет немного смещена, поскольку код Claude не поддерживает передачу координат мыши в пикселях.
- plugin должен отправлять запросы на получение данных на локальный HTTP-сервер для связи с CLI терминала-браузера, что может привести к появлению в вашей ОС сообщения о том, что ваш терминал хочет получить доступ к локальной сети
- Claude Code устанавливает очень большую минимальную ширину для области чата, поэтому иногда невозможно изменить размер окна браузера до нужного значения.
- plugin зависит от экспериментальной функции hooks claude code API, которая нестабильна, поэтому plugin может перестать работать между выпусками

[графический протокол kitty]: https://sw.kovidgoyal.net/kitty/graphics-protocol/

## Источник и лицензия

- Оригинальный автор: zenbu-labs
- Оригинальный репозиторий: https://github.com/zenbu-labs/terminal-browser
- Лицензия: MIT
- Русский перевод и локализация интерфейса: проект claude-code-mods-ru

# Operator Memory для Claude Code

Operator Memory обеспечивает Claude Code долговременный контекст проекта и пользователя, который поддерживают агенты в виде читаемого Markdown.

## Установка

Требуется Claude Code `v2.1.287` или новее и `operator-helper` в `PATH`.

```sh
operator-helper install claude-code
```

После установки запустите новый процесс Claude Code. Выполните `claude plugin list`, чтобы убедиться, что `operator@operator-memory` включен, и спросите агента, доступны ли инструкции Operator Memory.

Плагин внедряет вводную часть в основной system prompt и в подсказки задач субагентов. Память отображается один раз за процесс; чтобы перезагрузить память, перезапустите Claude Code. `/clear` не обновляет кэшированную вводную часть.

## Команды

- `/operator:user-init` — настроить раздел пользователя.
- `/operator:project-init` — настроить «мозг проекта».
- `/operator:index` — создать или обновить указатель проекта.

## Обновление

Помощник включает автообновление маркетплейса Operator при установке, в том числе при повторной. При желании отключите его позже в `/plugin` → Marketplaces.

Повторно выполните `operator-helper install claude-code` или используйте `claude plugin update operator@operator-memory`, затем перезапустите Claude Code.

Руководство по проверке, обновлениям и устранению неполадок — в [Claude Code guide](https://github.com/aerovato/operator-memory/blob/main/docs/harnesses/claude-code.md). Для локальной разработки выполните `bun run preview:claude-code` из корня рабочей папки.

## Источник и лицензия

- Оригинальный автор: aerovato
- Оригинальный репозиторий: https://github.com/aerovato/operator-memory
- Лицензия: BSD-3-Clause
- Русский перевод и локализация интерфейса: проект claude-code-mods-ru

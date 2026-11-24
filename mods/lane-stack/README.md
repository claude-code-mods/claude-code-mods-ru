# lane-stack (Claude Code plugin)

Клиентская часть Claude Lane Stack для Claude Code: агенты PM, слэш-команды и навыки-плейбуки.

Устанавливайте из маркетплейса репозитория (не копированием в `~/.claude/agents` / `~/.claude/skills`):

```bash
claude plugin marketplace add VKirill/claude-lane-stack
claude plugin install lane-stack@claude-lane-stack -y
```

`./install.sh` регистрирует этот GitHub-маркетплейс с `autoUpdate: true` и по-прежнему синхронизирует среду хоста (`bin/`, доску, профили писателей) в `~/.agents`. Файлы хоста не обновляются автоматически — запустите `./install.sh` снова. Рабочая копия: `LANE_INSTALL_LOCAL_MARKETPLACE=1 ./install.sh`.

Навыки находятся в пространстве имён `/lane-stack:<skill>`. Памятка по работе: `/lane-stack:info` или `/info`. Обсуждение нового приложения или сервиса: `/lane-stack:app-architect`. Живая документация: `/lane-stack:docs-maintain`. База фактов: `/lane-stack:lane-memory`. Плейбуки PM (`orchestrator-lanes`, `orchestrator-workflow`, `info`, `app-architect`) живут только в этом плагине и `~/.agents/pm-skills` — они не копируются в общий каталог писателей.

## Источник и лицензия

- Оригинальный автор: VKirill
- Оригинальный репозиторий: https://github.com/VKirill/claude-lane-stack
- Лицензия: MIT
- Русский перевод и локализация интерфейса: проект claude-code-mods-ru

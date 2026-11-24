<h1 align="center">compact-adviser</h1>

<p align="center">
  <a href="https://github.com/kunchenguid/compact-adviser/blob/main/LICENSE"
    ><img
      alt="Лицензия"
      src="https://img.shields.io/badge/license-MIT-green?style=flat-square"
  /></a>
  <a
    href="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-blue?style=flat-square"
    ><img
      alt="Платформа"
      src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-blue?style=flat-square"
  /></a>
  <a href="https://x.com/kunchenguid"
    ><img
      alt="X"
      src="https://img.shields.io/badge/X-@kunchenguid-black?style=flat-square"
  /></a>
  <a href="https://discord.gg/Wsy2NpnZDu"
    ><img
      alt="Discord"
      src="https://img.shields.io/discord/1439901831038763092?style=flat-square&label=discord"
  /></a>
</p>

**compact-adviser** — это плагин агента, который отвечает на один вопрос: стоит ли сейчас выполнить /compact?

![Compact adviser status line: "Compact adviser: work appears completed or recorded. Run /compact to save tokens." shown above a terminal prompt](https://raw.githubusercontent.com/kunchenguid/compact-adviser/main/docs/hint-status-line.png)

Он использует [Jev](https://typesafe.ai), чтобы мгновенно оценить, находится ли текущая сессия у границы, где сжатие безопасно.

Он может подсказать вам выполнить `/compact` — а на Pi и Claude Code при вашем согласии может сделать это за вас в нужный момент автоматически. Codex CLI и Grok работают только с подсказкой: ничто вне их сессий не может вызвать `/compact`.

Оценка — два однопредложенных вопроса Jev в одном запросе (завершена ли единица работы; это практическая работа или координация), которые в коде соединяются в одну оценку. Порог подсказки — 0.90, пока контекст в основном пуст (до примерно 10%), и смягчается к 0.50 к примерно 90% заполнения: неверная подсказка дороже всего, пока ещё есть место. «Полный» — точка, в которой хост сжимает: в Claude Code это порог автосжатия, если он включён, в остальных — окно модели. Если вы хотите сжимать заранее (длинные контексты дороже на каждом ходу), задайте бюджет контекста: порог тогда смягчается по мере приближения к меньшему из вашего бюджета и этой точки. Авторежим — тот же порог плюс подтверждение при первом использовании.

## Быстрый старт

Требования: Node 22+ (22.18+ для Codex и Grok) и один из [Pi](https://pi.dev) 0.82.0 или новее (проверено на **0.85.1**), Claude Code 2.1.274 или новее (проверено на **2.1.275**), Codex CLI 0.153.0 или новее (проверено на **0.153.4**) или [Grok Build](https://docs.x.ai/build/overview) 1.0.34 или новее (проверено на **1.0.34**), плюс [ключ TypeSafe API](https://console.typesafe.ai/settings/keys). Передайте его как `TYPESAFE_API_KEY` в окружении запуска или положите в `./.env` рабочего каталога сессии; Pi и Claude Code могут сохранить его через настройки, а Codex и Grok используют отдельный CLI compact-adviser. Jev — структурированная модель принятия решений TypeSafe; этот пакет задаёт ей два однопредложенных вопроса классификации и никогда не просит написать сводку.

Установка пакета означает согласие отправлять подходящий контекст контрольной точки в TypeSafe, когда ключ доступен и проходят остальные проверки продукта. При заданном `TYPESAFE_BASE` этот контекст и ключ идут на этот базовый адрес вместо стандартного.

### Pi

```sh
pi install npm:compact-adviser
```

Перезапустите Pi или выполните `/reload`, затем `/compact-adviser`.
`/compact-adviser status` должен сказать `Key: env`, `Key: saved` или `Key: .env`.

Для установки из git: `pi install git:github.com/kunchenguid/compact-adviser` (добавьте `-l` для установки в рамках проекта).

### Claude Code

Этот плагин использует Claude Mod — экспериментальную функцию, требующую `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` в окружении.

```sh
claude plugin marketplace add kunchenguid/compact-adviser
claude plugin install compact-adviser@compact-adviser
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude
```

Затем `/compact-adviser`.

### Codex CLI

Поддержка Codex — **только macOS и Linux**. Хуки плагина работают через POSIX `sh`, как и значок платформы в этом
репозитории; Windows в этом выпуске не поддерживается.

```sh
codex plugin marketplace add kunchenguid/compact-adviser
codex plugin add compact-adviser@compact-adviser
```

Перезапустите Codex и один раз просмотрите хук в `/hooks`, чтобы он стал доверенным. После завершённой
контрольной точки совет появится строкой `↳ Hook · Compact adviser: ...` под ответом.

Codex работает **только с подсказкой**: у него нет поверхности, которая позволила бы другому процессу выполнить `/compact`, поэтому
авторежима там нет. Настройки живут в небольшом CLI вместо слэш-команды; попросите Codex про
«compact-adviser status» — и встроенный навык выполнит его, или запустите сами:

```sh
node "$(ls -d "${CODEX_HOME:-$HOME/.codex}"/plugins/cache/*/compact-adviser/*/ | tail -1)src/cli.ts" status
```

### Grok Build

Grok работает **только с подсказкой**: ничто вне работающей сессии не может вызвать `/compact`, поэтому авторежима здесь нет. Подсказка рисуется в строке состояния и никогда не попадает в контекст модели.

```sh
grok plugin install kunchenguid/compact-adviser#packages/grok-plugin --trust
```

(Устанавливайте из подкаталога, не из корня репозитория: Grok читает и индекс маркетплейса Claude в этом репозитории, поэтому обычный `grok plugin marketplace add` предлагает два плагина с одинаковым именем и отказывается от установки без уточнения.)

Затем два одноразовых шага, поскольку Grok не позволяет плагину сделать ни один из них за вас. Запустите Grok и выполните:

```
/compact-adviser-install
```

Это записывает `${GROK_HOME:-~/.grok}/hooks/compact-adviser.json`, потому что **Grok 1.0.34 перечисляет собственный `hooks/hooks.json` плагина, но никогда не загружает его в сессию**. Хуки в вашем собственном домашнем каталоге Grok всегда доверенны, поэтому больше ничего не нужно; удалите этот файл, чтобы убрать их. Из оболочки это `node "$(node -e 'const l=JSON.parse(require("child_process").execFileSync("grok",["plugin","list","--json"],{encoding:"utf8"})); const p=(Array.isArray(l)?l:[]).find(x=>x&&x.name==="compact-adviser"); if(!p||typeof p.path!=="string") throw new Error("compact-adviser is not installed"); process.stdout.write(p.path)')/bin/adviser.ts" install`. После `install` `${GROK_HOME:-~/.grok}/compact-adviser/adviser.sh` находит текущий установленный плагин тем же способом.

Затем вставьте блок `[ui.status_line]`, который напечатал `install`, в указанный им путь config.toml и перезапустите Grok. Строка состояния по умолчанию выключена, и включить её может только ваш собственный конфиг — ни плагин, ни репозиторий. У Grok одна строка состояния, поэтому сценарий рисует и встроенные сегменты (`cwd`, `model`, `context`). В минимальном режиме отрисовки строки состояния нет вовсе.

На Grok сохраните ключ TypeSafe как `TYPESAFE_API_KEY` или `.env` в cwd либо командой `key` CLI из оболочки вне Grok. Не вводите секреты после слэш-команды Grok: Grok добавляет эти слова к модели.

## Если ничего не происходит

| Симптом | Причина |
| --- | --- |
| TypeSafe требует оплаты (HTTP 402) | Проверьте биллинг и кредиты аккаунта TypeSafe; одного ожидания недостаточно, чтобы удовлетворить требование оплаты. Контекст не меняется. |
| `Key: missing` в `/compact-adviser status` (Pi, Claude Code) или `/compact-adviser` (Grok) | Нет `TYPESAFE_API_KEY` в окружении запуска, сохранённых настройках или `./.env` рабочего каталога сессии |
| Нет команды `/compact-adviser` в Claude Code | `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` не равен ровно `1` |
| Команда есть, подсказки нет | Контекст ниже постоянного минимума в 40 000 токенов, сессия не простаивает или последний ход не был устоявшимся итоговым ответом |
| Claude Code: «несущественный трафик» | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` блокирует сетевые запросы плагина |
| Нет подсказки в Codex | Хук не доверен (просмотрите его в `/hooks`), Node старше 22.18 или хук вообще не находит Node — Codex пересобирает свой PATH, поэтому задайте `COMPACT_ADVISER_NODE` как абсолютный путь к `node` |
| Grok: нет строки подсказки вовсе | `[ui.status_line]` не задан в config.toml, который назвал `install`, или Grok в минимальном режиме отрисовки |
| Grok: нет подсказки после завершённого хода | `/compact-adviser-install` не запускался, поэтому никакой хук Stop не оценивает |
| Pi print / RPC / JSON, Claude `-p` или `codex exec` | Советчик бездействует в надёжно определяемых неинтерактивных сессиях |
| Совсем ничего, в любом хосте | `COMPACT_ADVISER_DISABLE` задан истинным значением |

## Переменные окружения

| Переменная | Действие |
| --- | --- |
| `TYPESAFE_API_KEY` | Ключ Jev; если не задан, используется сохранённый ключ или `./.env` рабочего каталога сессии |
| `TYPESAFE_BASE` | Заменяет базовый URL TypeSafe API, по умолчанию `https://api.typesafe.ai`; запрос идёт на `<base>/v1/systemone` без завершающего слеша. Читается только из окружения запуска, никогда из сохранённых настроек или `./.env`. Должен быть `https`; обычный `http` принимается только для loopback-хоста (`127.0.0.1`, `[::1]`, `localhost`). Любое другое значение или значение с учётными данными, запросом или фрагментом — ошибка конфигурации: ни запроса, ни совета |
| `COMPACT_ADVISER_DISABLE` | `1`, `true`, `yes` или `on` (в любом регистре) делают сессию инертной: нет запроса к TypeSafe, подсказки, автосжатия и команды. Имеет приоритет над сохранённым режимом `hint` или `auto` |
| `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` | Только Claude Code; должен быть ровно `1`, чтобы мод загрузился |
| `COMPACT_ADVISER_NODE` | Только Codex; абсолютный путь к исполняемому Node 22.18 или новее, когда хук не может найти его в пересобранном PATH |

Экспортируйте `COMPACT_ADVISER_DISABLE=1` для безнадзорных сессий агентов, где некому прочитать совет.

## Что отправляется в TypeSafe

| Включается | Не отправляется |
| --- | --- |
| Ограниченные пользовательские ограничения, до последних 64 видимых ответов и результатов инструментов (обрезанных), короткие выдержки из результатов инструментов, существующая сводка, имена сохранённых артефактов, маркеры пропусков | Системные подсказки, скрытые рассуждения, изображения, переменные окружения, ключ API в контексте модели и теле запроса, полные транскрипты |
| По возможности маскируются известные шаблоны ключей и очевидные результаты из чувствительных файлов | Гарантии нет. Для материалов, которые не должны покидать компьютер, удалите плагин или установите режим Off |

Запросы идут на `https://api.typesafe.ai/v1/systemone` или `<TYPESAFE_BASE>/v1/systemone`, если он задан, ограничены 32 000 сериализованных байт UTF-8 и никогда не считают ошибку положительным решением.
Ключ TypeSafe API никогда не попадает в контекст модели или тело запроса; он отправляется в заголовке Authorization для аутентификации вызова.
Подробности: [SECURITY.md](https://github.com/kunchenguid/compact-adviser/blob/main/SECURITY.md).

## Как это работает

```
settled turn
      │
      ▼
┌───────────────────┐
│ cheap local gates │  mode, 40k minimum, idle session, key, cooldowns
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ TypeSafe Jev      │  done × shape score, floor slides 0.90→0.50 with usage
└─────────┬─────────┘
          ▼
 hint: run /compact     or, with explicit auto, native compaction
```

Автоматическое сжатие доступно на Pi и Claude Code. На Codex та же оценка даёт только
подсказку строкой `↳ Hook ·` в прокрутке. На Grok две половины — отдельные
процессы: хук `Stop` оценивает и записывает вердикт, а сценарий `[ui.status_line]` читает
его и рисует подсказку. Хук Grok всегда разрешает остановку и ничего не печатает, поэтому
подсказка никогда не попадает обратно в модель.

На Claude Code необязательная настройка `beforeCompactPrompt` (по умолчанию пуста; задаётся в `/config`)
выполняет один ход перед этим автосжатием, и только после подтверждения авторежима. Установите её в
`/stow`, чтобы сначала выполнить команду `stow`. Claude Code не раскрывает слэш-команды и `@file`
в подсказке, отправленной плагином, и отклоняет подсказку плагина, начинающуюся с `/`, поэтому
значение, начинающееся с `/`, выполняется как команда, а не отправляется модели как текст. Если вы
отправите собственный запрос или выполните команду между ними, либо этот ход будет прерван, даст
ошибку или не завершится за 5 минут, ничего не сжимается. Режим подсказки, off и пустая настройка не меняются. Pi, Codex и
Grok не имеют этой настройки.

## Использование

| Команда | Действие |
| --- | --- |
| `/compact-adviser` (Pi и Claude Code) | Настройки (режим, минимум, журнал запросов, ключ TypeSafe API) |
| `/compact-adviser auto` / `hint` / `off` (Pi и Claude Code) | Сохранить режим; auto запрашивает подтверждение при первом использовании |
| `/compact-adviser status` (Pi и Claude Code) | Режим, минимум, бюджет, контекст, источник ключа (`env` / `saved` / `.env` / `missing`), время до повтора |
| `/compact-adviser threshold 60000` (Pi и Claude Code) | Сохранить абсолютный минимум токенов |
| `/compact-adviser budget 450000` / `budget off` (Pi и Claude Code) | Сохранить бюджет контекста: порог подсказки полностью смягчается при этом числе токенов или в точке сжатия хоста, если она меньше (по умолчанию off) |
| `/compact-adviser snooze` / `dismiss` (Pi и Claude Code) | Подавить следующие три обмена или сбросить текущую подсказку |
| `beforeCompactPrompt` в `/config` (Claude Code) | Необязательный текст, выполняемый перед автосжатием. По умолчанию пусто. `/stow` выполняет эту команду |
| `/compact-adviser` (Grok) | Показать статус; не добавляйте аргументы, потому что Grok отправляет их модели |
| `/compact-adviser-hint` / `/compact-adviser-off` (Grok) | Сохранить режим только с подсказкой или отключить советчик |
| `/compact-adviser-snooze` / `/compact-adviser-dismiss` (Grok) | Подавить следующие три обмена или сбросить текущую подсказку |
| `/compact-adviser-install` (Grok) | Зарегистрировать хуки и напечатать блок строки состояния для вставки в названный config.toml |
| `${GROK_HOME:-$HOME/.grok}/compact-adviser/adviser.sh threshold 60000` (оболочка Grok) | Сохранить абсолютный минимум токенов; `budget <tokens\|off>` сохраняет бюджет контекста; `help` перечисляет другие настройки только для оболочки |

В Codex те же команды — аргументы `src/cli.ts` плагина (`status`, `hint`, `off`,
`threshold`, `budget <tokens|off>`, `log on|off`, `key set|clear|status`), а не слэш-
команда, потому что плагины Codex не могут регистрировать команду с кодом. У Codex нет
snooze или dismiss: CLI не может сказать, какая сессия текущая.

## Профили оценки

Необязательный [профиль оценки](https://github.com/kunchenguid/compact-adviser/blob/main/docs/judge-profiles.md) меняет два вопроса, вес оценки или расписание порога, не меняя значения по умолчанию. Все четыре хоста принимают одну и ту же ограниченную JSON-строку в настройке `profile`. При оценке профиля держите режим подсказки. Некорректные профили отключают советы, а загрузка профиля никогда не даёт согласия на авторежим.

## Оценка

Локальная оценка решения использует реальные контрольные точки сессий, чтобы проверить, когда советчик должен предлагать `/compact`. Кривая ниже — из набора gold с учётом последующего контекста (96 контрольных точек, 40 сессий): по мере заполнения окна контекста порог оценки смягчается с **0.90** (использовано ≤10%) до **0.50** (использовано ≥90%), поэтому **полнота растёт** при высокой точности — экономия токенов предпочтительнее, когда сжатие всё равно скоро будет вынужденным.

![Use Jev to answer "should I /compact now?" — precision stays high while recall rises as context used goes from ≤10% to ≥90%](https://raw.githubusercontent.com/kunchenguid/compact-adviser/main/docs/eval-usage-floor-curve.png)

Харнесс оценки решения находится в [packages/pi-extension/eval/](https://github.com/kunchenguid/compact-adviser/blob/main/packages/pi-extension/eval/README.md). Это не опубликованный набор данных: укажите его на свои сессии и держите транскрипты локально.

## Источник и лицензия

- Оригинальный автор: kunchenguid
- Оригинальный репозиторий: https://github.com/kunchenguid/compact-adviser
- Лицензия: MIT
- Русский перевод и локализация интерфейса: проект claude-code-mods-ru

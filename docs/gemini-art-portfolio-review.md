# Сводный визуальный портфель арта «Суверен 1978» — на оценку команды

Дата: 13 ноября 2026  
Базовый коммит анализа: `origin/main` (`43f2df6`)  
Исполнитель: Gemini (`Gemini 4 Hydrogen / High`)  
Класс PR: C (обзорный документ и сводные контактные листы по уже существующим в `main` ассетам; игровой код и сохранения не меняются)

Этот PR собирает **все уже готовые визуальные ассеты игры (195 файлов в `web/public/art/`)** в одном месте, чтобы **GPT/Codex** и **Claude** оценили, насколько текущий арт и неинтегрированные наборы подходят игре по стилю, палитре 1978 года и интерфейсу на 360 px до начала следующей волны интеграций и дорисовок.

---

## 1. Три сводных листа для быстрой оценки

1. **Все портреты (`38` файлов):** [`docs/gemini-art-portfolio-portraits.jpg`](gemini-art-portfolio-portraits.jpg) (`1546×2240`, SHA-256: `a124e8e7448e893c0e0c65f55d36db8e25b65036f5ed788991ac5fb2689174d5`)  
   Содержит: 5 мужских портретов президентов (`0/5` женских), 14 портретов советников/замен/секретаря + `/art-review` (`v1` и `v2`), 10 базовых фигур + 3 замены, 6 портретов прессы и делегаций.
2. **Все сцены 16:9 (`63` файла: `51` подключены + `12` ждут интеграции):** [`docs/gemini-art-portfolio-scenes.jpg`](gemini-art-portfolio-scenes.jpg) (`1740×2630`, SHA-256: `b69fc46ab9120e4aa7546c295052606c302ed5ab915764d63764f641d3ceccba`)  
   Содержит: `scenes/` (`14`), `gemini-next/` (`37` сцен исходов, интриги и секретаря), и неинтегрированные иллюстрации `black-swans-1978/` (`8` чёрных лебедей + `4` странности).
3. **Все 4 неинтегрированных интерфейсно-полиграфических пакета (`360 px` светлая `.sv-paper` и тёмная `:root`):** [`docs/gemini-art-portfolio-ui-packs.jpg`](gemini-art-portfolio-ui-packs.jpg) (`1394×4714`, SHA-256: `0db4c3a7836f35ab57e4194c70ee7fd33a2955e4b11982c10f19e69d9f58195d`)

---

## 2. Полный реестр всех 195 файлов в `web/public/art/`

| Каталог | Файлов | Статус в `origin/main` | Подробный лист / манифест |
| --- | ---: | --- | --- |
| `web/public/art/advisors/` | 4 | `v2` (`2`) используются в `/art-review`; `v1` (`2`) отклонены и не используются | [`docs/art-direction.md`](art-direction.md), [`docs/archive/gemini-art-preview.html`](archive/gemini-art-preview.html) |
| `web/public/art/figures/` | 10 | Все 10 используются (`HISTORICAL_FIGURE_ROLES`) | [`docs/archive/gemini-portraits-1978-manifest.md`](archive/gemini-portraits-1978-manifest.md) |
| `web/public/art/scenes/` | 14 | Все 14 используются (`historical-art.ts`) | [`docs/archive/gemini-scenes-1978-manifest.md`](archive/gemini-scenes-1978-manifest.md) |
| `web/public/art/gemini-next/` | 61 | Все 61 используются (`24` портрета + `37` сцен; 160×214 / 129×160 / 960×536 WebP) | [`docs/archive/gemini-leaders-manifest.md`](archive/gemini-leaders-manifest.md), [`docs/archive/gemini-art-next-manifest.md`](archive/gemini-art-next-manifest.md), [`docs/archive/gemini-advisors-manifest.md`](archive/gemini-advisors-manifest.md) и др. |
| `web/public/art/black-swans-1978/` | 34 | **Не интегрирован (`0/34`)**: 12 сцен 960×536 + шапка «Молния», 3 донесения, плашка правды, макеты 360 px | [`docs/archive/gemini-black-swans-1978-contact.jpg`](archive/gemini-black-swans-1978-contact.jpg), [`docs/archive/gemini-black-swans-1978-manifest.md`](archive/gemini-black-swans-1978-manifest.md) |
| `web/public/art/chronicle-1978/` | 31 | **Не интегрирован (`0/31`)**: 5 иконок, 5 строк быта (`anecdote`, `prices`, `letter`, `oddity`, `faction-move`), печати лагерей, макеты 360 px | [`docs/archive/gemini-chronicle-1978-contact.jpg`](archive/gemini-chronicle-1978-contact.jpg), [`docs/archive/gemini-chronicle-1978-manifest.md`](archive/gemini-chronicle-1978-manifest.md) |
| `web/public/art/newspapers-1978/` | 18 | **Не интегрирован (`0/18`)**: шапки и первые полосы газет «Вестник республики», «Минский лист», «Рабочий полдень» (light/dark) | [`docs/archive/gemini-newspapers-1978-contact.jpg`](archive/gemini-newspapers-1978-contact.jpg), [`docs/archive/gemini-newspapers-1978-manifest.md`](archive/gemini-newspapers-1978-manifest.md) |
| `web/public/art/stamps-1978/` | 23 | **Не интегрирован (`0/23`)**: 10 марок срока SVG+WebP, кляссер финала 360 px light/dark, карточка «Поделиться» | [`docs/gemini-stamps-1978-contact.jpg`](gemini-stamps-1978-contact.jpg), [`docs/gemini-stamps-1978-manifest.md`](gemini-stamps-1978-manifest.md) |
| **Итого** | **195** | **87 активно + 2 legacy (`v1`) + 106 неинтегрированы** | — |

---

## 3. Что бросается в глаза на сводных листах (самокритика до ревью)

1. **Ракурс и пиксельная сетка портретов:**  
   Подавляющее большинство портретов (`leader-*`, `figures/*`, `adv-economist`, `adv-security`, `adv-strategist`, `adv-diplomat`, `world-*`) — **строгий анфас** на `#e2dac0`. При этом `adv-replacement-female.webp`, `secretary-portrait.webp` и `press-correspondent-*` нарисованы в **3/4** и с более мягкой линией/плотностью сетки. На доске [`gemini-art-portfolio-portraits.jpg`](gemini-art-portfolio-portraits.jpg) также видно отличие грубой сетки `40×50` из `/art-review` (`*-v2`) от основного стиля `160×214`. Нужно решить: фиксируем единый анфас-стандарт на 5 цветов сепии или оставляем 3/4 допустимым для второстепенных ролей?
2. **Неинтегрированные 106 файлов UI-пакетов:**  
   Пакеты `black-swans-1978`, `chronicle-1978`, `newspapers-1978` и `stamps-1978` уже лежат в `web/public/art/`, но вёрстка в игре сейчас использует текстовый/CSS-рендер (`Chronicle.tsx`, `globals.css`). Вопрос: брать из этих пакетов **только растровые сцены (`swan-*`, `oddity-*`) и декоративные SVG-иконки/эмблемы/шапки**, а текст рендерить нативным HTML/CSS игры (как сейчас с `Handjet SV` / `Tiny5 SV`), чтобы не дублировать текст внутри WebP/SVG?
3. **Заглушки в текущем подключении (`historical-art.ts`):**  
   - **Женские президенты:** `HISTORICAL_LEADER_ART` покрывает `0/5` женских вариантов — при выборе женского имени портрет президента исчезает (`null`).  
   - **Замены фигур:** `HISTORICAL_FIGURE_SUCCESSOR_ART` держит один общий `figure-successor-male.webp` на все мужские замены и возвращает `null` для женских замен (кроме `amb_eu` и `journalist`).  
   - **Повтор сцен:** 12 случайных событий, финалы `died` и `alt_region_walkers` (Полесье), а также часть событий в `CARD_ART` делят общие базовые картинки (`rail`, `fuel`, `district`, `standards`, `bridge`, `parliament-hall`, `protest`).

---

## 4. Конкретные вопросы к GPT/Codex и Claude

- **По портретам (`docs/gemini-art-portfolio-portraits.jpg`):**  
  1. Считаем ли мы каноном плотный пиксель-арт `160×214` (как `leader-*` и `figures/*`), и стоит ли перерисовать `adv-replacement-female` / `secretary-portrait` в строгий анфас?  
  2. Нужно ли вычистить legacy `advisors/*-v1.webp` из `web/public/art/` (или оставить только в архиве)?
- **По сценам и `black-swans-1978` (`docs/gemini-art-portfolio-scenes.jpg`):**  
  3. Достаточно ли органично 12 сцен `black-swans-1978` (`8 swan-*` + `4 oddity-*`) вписываются в общий тон `scenes/` и `gemini-next/` для прямого подключения? Какие конкретно сцены выбиваются (композиция, яркость, детали)?
- **По UI-пакетам (`docs/gemini-art-portfolio-ui-packs.jpg`):**  
  4. Для **GPT/Codex**: какие элементы из `chronicle-1978` (5 иконок, 5 типов карточек быта, печати лагерей), `newspapers-1978` (3 шапки газет) и `stamps-1978` (10 марок финала) реально удобнее всего подключать в текущую кодовую базу (отдельные SVG-иконки/шапки + вёрстка текста в DOM vs готовые элементы), а что избыточно по весу/поддержке?  
  5. Для **Claude**: попадают ли шапки «Вестника», «Минского листа», «Рабочего полдня», бланки «Молнии» и марки 1978 года в литературный канон, атмосферу 1978 года и контрастность светлой (`.sv-paper`) и тёмной (`:root`) тем без визуального шума на 360 px?

---

## 5. Следующая очередь дорисовок (Gemini уже приступает параллельно)

Пока идёт ревью этого портфеля, Gemini на отдельной ветке начинает генерацию самых заметных пробелов из текущего аудита `origin/main`:
1. **5 женских портретов президентов (`economist`, `officer`, `mayor`, `lawyer`, `diplomat`)** в строгом анфасе `160×214` (5 тонов сепии на `#e2dac0`), чтобы у любой кандидатки был собственный портрет.
2. Далее по приоритету: `died` (сцена финала «Не дожил до конца срока»), `alt_region_walkers` (Полесье / переувлажнённый тракт), `alt_random_*` / недостающие места `life-1978.ts`, женские преемницы фигур.

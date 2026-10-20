# Арт-пакет играбельных портретов президента (Неманская республика, 1978)

Пять канонических пиксель-арт портретов президента для выбора образа и персоналии в удостоверении ЦИК на первом утре (`PresidentialOpening`) и сквозного отображения в карточке первого дня (`BriefCard`), досье (`Intro`) и архивном табеле финала (`Ending`).

## Состав пакета

| ID портрета (`LeaderPortraitId`) | Архетип / подпись в удостоверении | Пол (`female`) | Игровой WebP (`160×214`, `Q=84`) | Размер | SHA-256 (WebP) | Исходник (`896×1200`) |
| --- | --- | --- | --- | --- | --- | --- |
| `economist` | Госплан · Технократ | `false` (муж.) | `web/public/art/gemini-next/leader-economist.webp` | 3 688 Б | `03f563204a5a2050c78e284b3610278cbb08e46d1b841dd6eeeedbcae2c9f834` | `art-source/gemini-next/leader-economist.jpg` |
| `officer` | Кабинет · Силовик | `false` (муж.) | `web/public/art/gemini-next/leader-officer.webp` | 3 672 Б | `67edeb77c23edfc11d7ed2fb572a701169bb00081b8b32bb9637b445fbfa58ed` | `art-source/gemini-next/leader-officer.jpg` |
| `mayor` | Обком · Хозяйственник | `false` (муж.) | `web/public/art/gemini-next/leader-mayor.webp` | 5 160 Б | `f2a7bb7260040a7ade352085fe4eb734ffa7e94d9607f0d608cd13c3243fc604` | `art-source/gemini-next/leader-mayor.jpg` |
| `lawyer` | Юстиция · Реформатор | `true` (жен.) | `web/public/art/gemini-next/leader-lawyer.webp` | 3 888 Б | `7995f376610c0202902e571a271127d8b79c28807a9dc217ad24851fca0ec58b` | `art-source/gemini-next/leader-lawyer.jpg` |
| `diplomat` | МИД · Дипломат | `true` (жен.) | `web/public/art/gemini-next/leader-diplomat.webp` | 4 336 Б | `596c98da3a3ca22c5c82cc13c7d7616299a284d51f0fc33f4f4609fa63c554e1` | `art-source/gemini-next/leader-diplomat.jpg` |

- Контактный лист (`5×1`): `docs/gemini-leaders-contact.jpg` (`42c9aa9d9c274bb5783b75778fad14a5cd7d133057a43b63f9e6ee1aad569a33`)
- Суммарный вес всех 5 игровых WebP: **20,7 КБ** (при лимите ≤ 10 КБ на один портрет).

## Правила подключения (`web/lib/client/historical-art.ts` и `web/lib/game/classic.ts`)

1. В `Leader` (`types.ts`) добавлено необязательное поле `portrait?: LeaderPortraitId`.
2. Если `leader.portrait` не задан (например, в старых сохранениях или базовых модульных тестах `createInitialState`), `historicalPortraitArt(state, state.leader.name)` возвращает `null`, сохраняя обратную совместимость.
3. При старте новой партии в кампании 1978 года (`ALTERNATE_COUNTRY`) и при переключении образа в удостоверении ЦИК (`PresidentialOpening`) вызывается `customizeLeader(state, opts)`:
   - Любой из 5 портретов можно сочетать с любой из 5 биографий (`bio`) и любым из 4 политических курсов (`ideo`).
   - При выборе женского (`lawyer`, `diplomat`) или мужского (`economist`, `officer`, `mayor`) портрета автоматически подбирается соответствующее по роду имя из белорусского пула 1978 года (`freshLeaderName`), не пересекающееся с ключевыми фигурами и советниками, а также согласованный по роду текст биографии (`bioText`) и финального вердикта (`buildVerdict`).

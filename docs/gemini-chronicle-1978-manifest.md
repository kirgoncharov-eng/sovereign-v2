# Пакет Gemini: строки быта в хронике — анекдот, ценник, письмо, странность и ход лагеря (#380)

Пакет закрывает художественную и визуальную часть задачи [#380](https://github.com/kirgoncharov-eng/sovereign-v2/issues/380) (в рамках эпика [#369](https://github.com/kirgoncharov-eng/sovereign-v2/issues/369), в связке с задачами [#379 «Голос улицы»](https://github.com/kirgoncharov-eng/sovereign-v2/issues/379), [#375 «Лагеря действуют сами»](https://github.com/kirgoncharov-eng/sovereign-v2/issues/375), [#371 «Чёрные лебеди и странное»](https://github.com/kirgoncharov-eng/sovereign-v2/issues/371) и лентой [#302 «Хроника срока»](https://github.com/kirgoncharov-eng/sovereign-v2/issues/302)).

Режим выполнения: **Gemini 4 Argon / Medium** (подтверждён параметрами запуска сессии).

---

## 1. Состав пакета и структура каталогов

- **Контактный лист (для приёмки в один экран):**
  - `docs/gemini-chronicle-1978-contact.jpg` (`1600×1800`, `462 554` байт, SHA-256 `5ac3f7f100509b51860b8acf8e558463aa97e0700e99dc4dc1605846e9710c4d`)
- **Часть 1 — 5 видов строк быта в хронике (масштабируемые SVG + рабочие WebP + архивные JPEG в светлой `.paper` и тёмной `:root` темах):**
  - `row-anecdote-{light,dark}.{svg,webp,jpg}` — Анекдот квартала (машинописный листок «самиздат» через фиолетовую копирку);
  - `row-prices-{light,dark}.{svg,webp,jpg}` — Цены и очередь (картонный магазинный ценник с люверсом, бечёвкой и 3 графами: хлеб, бензин, очередь);
  - `row-letter-{light,dark}.{svg,webp,jpg}` — Письмо обычного человека (разлинованный тетрадный лист с красно-синей почтовой каймой конверта и круглым почтовым штемпелем);
  - `row-oddity-{light,dark}.{svg,webp,jpg}` — Странность в хронике (тихая ночная заметка на полях со светящимся зелёным глазком радиолы `6Е1П`);
  - `row-faction-move-{light,dark}.{svg,webp,jpg}` — Ход лагеря (ведомственный щит-печать, двойная скобка досье и штамп «Без вашей визы»).
- **Отдельные векторные значки полей (`40×40` SVG) и набор из 5 печатей лагерей (#375):**
  - `web/public/art/chronicle-1978/icon-{anecdote,prices,letter,oddity,faction}.svg`
  - `faction-seals-{light,dark}.{svg,webp,jpg}` (Силовики, Совет приходов, Торговая палата, Промышленники, Союз республики)
- **Часть 2 — Макеты непрерывной ленты «Хроники срока» на экране телефона `360 px`:**
  - `chronicle-feed-360px-light.{webp,jpg}` и `chronicle-feed-360px-dark.{webp,jpg}` (`720×2080`, 2x от `360 px`).

---

## 2. Как 5 видов строк различаются на телефоне `360 px` без чтения подписи

Главное правило #380: **строки не тяжелее текста** (высота каждой строки на экране `360 px` — всего `53–62 px`, без тяжёлых картинок во всю высоту экрана), но каждая строка мгновенно узнаётся боковым зрением за счёт собственной формы края, бумаги, левого знака и гарнитуры:

| Вид строки (`LineKind`) | Материал и силуэт полосы | Левый знак (узнаваем без текста) | Типографика |
| --- | --- | --- | --- |
| **1. Анекдот квартала** (`anecdote`) | Полупрозрачный серо-лиловый листок папиросной бумаги («четвёртая закладка через копирку») с неровным правым обрывом и вторым листком снизу | Круглое кольцо клавиши пишущей машинки `«» САМ`, пометка `экз.4` и забитая иксами опечатка `ххх` | Фиолетово-серая машинопись (`Courier New`, `15px`) |
| **2. Цены и очередь** (`prices`) | Скошенный слева картонный магазинный ценник / доска прейскуранта, разбитый на **3 табличные ячейки** (хлеб, бензин АИ-76, очередь) | Пробитый круглый **люверс с петелькой шпагата** на левом мысе ярлыка | Крупные магазинные цифры (`18 коп.`, `1 р. 60 к.`, `45 мин.`) со стрелками динамики `▲` |
| **3. Письмо человека** (`letter`) | Тетрадный лист в синюю линейку с вертикальной красной чертой полей и **красно-синей диагональной каймой почтового конверта** по верхнему краю | Круглый **почтовый штемпель с волнами гашения** и контуром конверта | Живой курсив (`PT Serif Italic`) + подпись отправителя справа внизу |
| **4. Странность** (`oddity`) | Тихая приглушённая полоса с двойной тёмно-зелёной чертой на полях и пунктирным контуром | Круглый **«зелёный глазок» лампового радиоприёмника (`6Е1П`)** и тонкая синусоида волны | Спокойный разреженный курсив с длинным тире `—` |
| **5. Ход лагеря** (`faction-move`) | Плотная карточка ведомственной сводки с широким красным корешком слева | **Пятиугольный щит-печать со звездой** (или один из 5 гербов лагерей из `faction-seals-*`) | Красная плашка лагеря сверху + основной текст с жирным зачином **«Без вашей визы…»** |

---

## 3. Таблица файлов, размеров и SHA-256

### 3.1. Шаблоны строк хроники (`640 px` SVG / `1280 px` 2x WebP и JPEG)

| ID | Тема | Рабочий WebP (`web/public/art/chronicle-1978/`) | Байты WebP | SHA-256 WebP | Вектор SVG (`web/public/art/chronicle-1978/`) | SHA-256 SVG | Архивный JPEG (`art-source/chronicle-1978/`) | SHA-256 JPEG |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| `row-anecdote-light` | `.paper` | `row-anecdote-light.webp` (`1280×256`) | 28 434 | `bb938edef781caf8267db67a8792cf3d1551e9be1d277c48ee9488b86f42d068` | `row-anecdote-light.svg` (`2 718` Б) | `57043cbfa333d0a95202650f8301be4cd5ee9b25c22e7aa49e7dd7a5136e5143` | `row-anecdote-light.jpg` (`66 589` Б) | `7a777d8758e343e6729ab25290818ebb54ca60501a299e5bec45e7d40a81ab4f` |
| `row-anecdote-dark` | `:root` | `row-anecdote-dark.webp` (`1280×256`) | 27 586 | `de4e817b06bbacc32dac340400b3a3747bfebb760d2a867cf91612209bc94711` | `row-anecdote-dark.svg` (`2 718` Б) | `8628736b82c0db0c383391a2f8b4a6a372edf1b32e1de6185bfe8996b1ef90f4` | `row-anecdote-dark.jpg` (`64 874` Б) | `eb6516b9c43ae577e0787e8f7b2b30c7bc017f2e2a0041275cc9c0ef46edfb57` |
| `row-prices-light` | `.paper` | `row-prices-light.webp` (`1280×232`) | 29 948 | `ac5248c04e76df39ad4bff24c9e49d322021932aae5974766745c073c0d0328e` | `row-prices-light.svg` (`3 984` Б) | `59381889a8be552c77dd120ac2d1aca05278ac261ca1966931ba8da51d48700b` | `row-prices-light.jpg` (`79 173` Б) | `e89c80e066bab8799fa80dc8787527effdb9c38306960ed63dd2eb64e73c39eb` |
| `row-prices-dark` | `:root` | `row-prices-dark.webp` (`1280×232`) | 29 822 | `6517b5e30a400a6275483f528f0f5d3a84b2b63810b3ba8a692649273464180b` | `row-prices-dark.svg` (`3 984` Б) | `0382dabc6dd5c7395f096db0d9745367c258d2b70689a7903cb2392748e438f3` | `row-prices-dark.jpg` (`79 099` Б) | `c857ec2138ec5848b214a7b326c48e95a1d334d756fd578783733b8ef18bd474` |
| `row-letter-light` | `.paper` | `row-letter-light.webp` (`1280×256`) | 44 302 | `19c40f5a310116e333fa1eee104ae4c906374d4b3512c5c2a4938d9b1f458da5` | `row-letter-light.svg` (`5 044` Б) | `52f0b413d58375ba069d1e95267d5c9993217cbcdd02fc7211daec434212f97e` | `row-letter-light.jpg` (`89 765` Б) | `80ea78ac127516023f9941596491a0f3b0a9d75e91b5089dcf08790839f04e4b` |
| `row-letter-dark` | `:root` | `row-letter-dark.webp` (`1280×256`) | 42 986 | `539d6480eabfdba7c74f8d3ae0b2c725a5d4d67bd3e917dfbef2b559ae95c918` | `row-letter-dark.svg` (`5 050` Б) | `0847775b939e4269c36fe842c8bbb14de785e821964fc5fff8d70a987b9a3132` | `row-letter-dark.jpg` (`88 355` Б) | `19431faa2f8e27aa85761cd8ce51c29c2c4f026be05614da5d4390a68fd531e0` |
| `row-oddity-light` | `.paper` | `row-oddity-light.webp` (`1280×220`) | 41 252 | `ec0d5f9fc2be5619cb49ac679d78a469ba4bebfbd8303dfd41e604b46831836a` | `row-oddity-light.svg` (`1 889` Б) | `5eecff050fe9d7cf95b8605d5ba4324029fcae8ab34918069bd94882c7ef6269` | `row-oddity-light.jpg` (`82 884` Б) | `5ebc0c08158966727e286b9a78bd5ad71ca23b0dcbbf49854472671217d26e13` |
| `row-oddity-dark` | `:root` | `row-oddity-dark.webp` (`1280×220`) | 41 734 | `b9dbc8acba1f71640e46d54665ac65761078875c6daddef2335684513b1d440f` | `row-oddity-dark.svg` (`1 889` Б) | `fa4021f9c361e9a800585574345c23fcfd101c43883509f44832ea981b4d467f` | `row-oddity-dark.jpg` (`85 107` Б) | `6c2b796637b3c04b7394a4e545775b496614798061c1d3c0d145f7180e34d7d2` |
| `row-faction-move-light` | `.paper` | `row-faction-move-light.webp` (`1280×240`) | 30 200 | `981f1e3f39485ddbf1f74d1dcfb0c41da08c05dfdaa69ad4f42452357531bc5b` | `row-faction-move-light.svg` (`2 270` Б) | `8620fa90196f1b1f199b8383c7af921984da726732cb8b552896456c14a644f2` | `row-faction-move-light.jpg` (`72 583` Б) | `55fe99304effeef9a4becace9b66dd0390a7d89b31849e4703bcb0851283f143` |
| `row-faction-move-dark` | `:root` | `row-faction-move-dark.webp` (`1280×240`) | 30 376 | `affb2f717b1848c7faafd1da496db4eccb51b4ba44c199b80f0e51fecd92889c` | `row-faction-move-dark.svg` (`2 270` Б) | `64decf3f291480e4f1205c2d6d19e09f3e02ab0bc4b9c7dd0cbad3f9a7f49419` | `row-faction-move-dark.jpg` (`73 378` Б) | `c0d9bffb68b82621e8528ef2b45b8f7368c421f6523d6d066ae467c9f5e0b4a1` |
| `faction-seals-light` | `.paper` | `faction-seals-light.webp` (`1280×208`) | 19 746 | `7a471346da1e4caca3168659fbadb8fcd449eace58302102a1a17dce1f67cdc6` | `faction-seals-light.svg` (`4 871` Б) | `fc18248f4084ff5227ebe549e53dd7f581f414fd74faa28af12c4a2371c1d508` | `faction-seals-light.jpg` (`52 916` Б) | `6da60501de07054a41ec5a6bf541f46535631c34ab45eff4b57bb69246fad8b8` |
| `faction-seals-dark` | `:root` | `faction-seals-dark.webp` (`1280×208`) | 20 016 | `a7adb4f9de6c08feebaf62c01d48d0f51864b6ced6b4526dfbd9344be8ce103b` | `faction-seals-dark.svg` (`4 871` Б) | `02f1a023070d6bf1232c8cee3cb875ad64bbeb598a103a0c20e9be1de8a39c19` | `faction-seals-dark.jpg` (`54 195` Б) | `2674f39e6f4335b02a665ab241599e35fb9ac7714a7d0d636a88921acb20c83d` |
| `chronicle-feed-360px-light` | `.paper` | `chronicle-feed-360px-light.webp` (`720×2080`) | 144 468 | `5148773d2e767015310c235ab76b4d0d21c4063b182478cc646aaafabcfe5c0d` | — | — | `chronicle-feed-360px-light.jpg` (`303 289` Б) | `2bc4170f902e27729f7c8eac13a31b1ac40aeb8b846dc29b86ea5d7e4b77bed5` |
| `chronicle-feed-360px-dark` | `:root` | `chronicle-feed-360px-dark.webp` (`720×2080`) | 146 220 | `b1b15dbd41b97da60c7270c952fe91a619a8f6f2ab851e0fedd64ec08cb55205` | — | — | `chronicle-feed-360px-dark.jpg` (`302 537` Б) | `35f04b091abfe73e63b6099d048d2523c2e9603da0c1ef222a28820b7db9483b` |

### 3.2. Векторные значки полей (`40×40` SVG для встраивания в CSS/JSX строк)

| ID | Файл (`web/public/art/chronicle-1978/`) | Байты | SHA-256 |
| --- | --- | ---: | --- |
| `icon-anecdote` | `icon-anecdote.svg` | 610 | `0d4234073a9e2e6d0ec2e0c68cacd310185b4407642d911f6a4d02e650b3235b` |
| `icon-prices` | `icon-prices.svg` | 754 | `a70176f54c002efe76bb5541eda86a9374ce95ee4bd9f168413bf97051a1ae3f` |
| `icon-letter` | `icon-letter.svg` | 613 | `2bf0ac4cda8d4c84998b71a168ee922bdea89e7dc47688b1b5de00b64c91681e` |
| `icon-oddity` | `icon-oddity.svg` | 395 | `64bcdb0e7fcab4aa55f49319542c32c2c966d5bc254f55280173476adbcc9ff1` |
| `icon-faction` | `icon-faction.svg` | 454 | `63a86e9b38273958f66c7a2b907707900e1c6c345ac54bfeabfb2e026997f3c6` |

---

## 4. Правила интеграции в `web/app/chronicle/` (для GPT, класс B)

1. **Лёгкая вёрстка (HTML/CSS + встроенный левый SVG-значок `icon-*.svg`):**
   - В `web/lib/client/chronicle.ts` добавить виды строк `anecdote | prices | oddity | factionMove` (и обновить существующий `.letter` в `web/app/chronicle/chronicle.module.css`).
   - Каждая строка рендерится как компактный flex/grid-блок с левым полем `44 px` (в котором стоит соответствующий `icon-*.svg` и вертикальный разделитель) и правой текстовой колонкой:
     - `.anecdote`: фон `#ebe7dc` (в тёмной `#262328`), пунктирная левая линия `#7a6e7d`, шрифт `'Courier New', monospace`, цвет `#352947` / `#d8caee`;
     - `.prices`: фон ярлыка `#d4c39b` (`#2c261c`), скошенный левый край `clip-path: polygon(14px 0, 100% 0, 100% 100%, 14px 100%, 0 50%)` с люверсом и `display: grid; grid-template-columns: repeat(3, 1fr)` для трёх ячеек цен;
     - `.letter`: фон `#eee6cf` (`#27221c`) с верхней почтовой каймой `repeating-linear-gradient(-45deg, #8f2c20 0 6px, transparent 6px 10px, #24436e 10px 16px, transparent 16px 20px)` высотой `4px` и линейкой `repeating-linear-gradient(to bottom, transparent 0 21px, rgba(56,98,150,.2) 21px 22px)`;
     - `.oddity`: фон `#d4d0be` (`#18201d`), двойная левая граница `4px double #2a5c47`, курсивный текст и значок `icon-oddity.svg`;
     - `.factionMove`: фон `#e5dac0` (`#28201d`), левый корешок `6px solid #8c2b20`, плашка имени лагеря сверху и соответствующая печать из `faction-seals-*.svg`.

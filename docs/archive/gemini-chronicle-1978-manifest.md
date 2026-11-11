# Пакет Gemini: строки быта в хронике — анекдот, ценник, письмо, странность и ход лагеря (#380)

Пакет закрывает художественную и визуальную часть задачи [#380](https://github.com/kirgoncharov-eng/sovereign-v2/issues/380) (в рамках эпика [#369](https://github.com/kirgoncharov-eng/sovereign-v2/issues/369), в связке с задачами [#379 «Голос улицы»](https://github.com/kirgoncharov-eng/sovereign-v2/issues/379), [#375 «Лагеря действуют сами»](https://github.com/kirgoncharov-eng/sovereign-v2/issues/375), [#371 «Чёрные лебеди и странное»](https://github.com/kirgoncharov-eng/sovereign-v2/issues/371) и лентой [#302 «Хроника срока»](https://github.com/kirgoncharov-eng/sovereign-v2/issues/302)).

Режим выполнения: **Gemini 4 Argon / Medium** (подтверждён параметрами запуска сессии).

---

## 1. Состав пакета и структура каталогов

- **Контактный лист (для приёмки в масштабе `1×` на `360 CSS px`):**
  - `docs/archive/gemini-chronicle-1978-contact.jpg` (`1620×1520`, `576 353` байт, SHA-256 `7988d05777d95764157fa989a509ecf159f02809f7ed789d5c6bae6b7201f3bc`)
- **Часть 1 — 5 видов строк быта в хронике (масштаб `1×` колонки мобильного экрана `viewBox="0 0 328 H"`, шрифт `14.2–16 CSS px`, естественный перенос и высота `134–164 px`):**
  - `row-anecdote-{light,dark}.{svg,webp,jpg}` — Анекдот квартала (машинописный листок «самиздат» через фиолетовую копирку, `328×138` CSS px);
  - `row-prices-{light,dark}.{svg,webp,jpg}` — Цены и очередь (картонный магазинный ценник с люверсом, бечёвкой и 3 графами: хлеб, бензин, очередь, `328×134` CSS px);
  - `row-letter-{light,dark}.{svg,webp,jpg}` — Письмо обычного человека (разлинованный тетрадный лист с красно-синей почтовой каймой конверта и круглым почтовым штемпелем, `328×164` CSS px);
  - `row-oddity-{light,dark}.{svg,webp,jpg}` — Странность в хронике (тихая ночная заметка на полях со светящимся зелёным глазком радиолы `6Е1П`, `328×144` CSS px);
  - `row-faction-move-{light,dark}.{svg,webp,jpg}` — Ход лагеря (ведомственный щит-печать, двойная скобка досье и штамп «Без вашей визы», `328×148` CSS px).
- **Отдельные векторные значки полей (`40×40` SVG) и набор из 5 печатей лагерей (#375):**
  - `web/public/art/chronicle-1978/icon-{anecdote,prices,letter,oddity,faction}.svg`
  - `faction-seals-{light,dark}.{svg,webp,jpg}` (Силовики, Совет приходов, Торговая палата, Промышленники, Союз республики)
- **Часть 2 — Контрольные макеты непрерывной ленты «Хроники срока» на экране телефона `360 px` в масштабе `1×` (`deviceScaleFactor: 1`, HTML-текст `14.5 CSS px` отдельно от SVG-декора):**
  - `chronicle-feed-360px-light.{webp,jpg}` (`360×1345`, `1×`) и `chronicle-feed-360px-dark.{webp,jpg}` (`360×1330`, `1×`).

---

## 2. Как 5 видов строк различаются на телефоне `360 px` без чтения подписи и сохраняют читаемость `14.5–16 CSS px`

1. **Читаемый размер текста на `360 px` (`1×`):**
   - И в контрольных макетах `chronicle-feed-360px-{light,dark}` (свёрстанных реальным HTML-текстом отдельно от SVG-декора), и в автономных шаблонах `row-*-{light,dark}.svg` (`viewBox="0 0 328 H"`, где `1 ед. SVG = 1 CSS px` колонки на экране `360 px`) основной текст имеет размер **`14.2–16 CSS px`** (вровень с основным текстом хроники `.scene { font-size: 14.5px }`), а подписи и рубрики — **`11.5–12.5 CSS px`**.
   - Каждая вставка переносится естественно в 3–4 строки с собственной высотой (`115–164 CSS px`), без сжатия широкой полосы и без потери читаемости.
2. **Узнаваемость боковым зрением без чтения подписи:**

| Вид строки (`LineKind`) | Материал и силуэт полосы | Левый знак (`icon-*.svg`, узнаваем без текста) | Типографика (`1×` на `360 px`) |
| --- | --- | --- | --- |
| **1. Анекдот квартала** (`anecdote`) | Серо-лиловый листок папиросной бумаги («четвёртая закладка через копирку») с пунктирным сгибом и тенью второго листка | Круглое кольцо клавиши пишущей машинки `«» САМ`, пометка `экз.4` и забитая иксами опечатка `ххх` | Фиолетово-серая машинопись (`Courier New`, `14.2 CSS px`, `line-height: 1.36`) |
| **2. Цены и очередь** (`prices`) | Картонный магазинный ценник / доска прейскуранта, разбитый на **3 табличные ячейки** (хлеб, бензин АИ-76, очередь) | Пробитый круглый **люверс с петелькой шпагата** и ярлык `РУБ / КОП` | Крупные магазинные цифры (`18 коп.`, `1р. 60к.`, `45 мин.`, `14.5–16 CSS px`) со стрелками `▲` |
| **3. Письмо человека** (`letter`) | Тетрадный лист в синюю линейку с вертикальной красной чертой полей и верхней почтовой каймой | Круглый **почтовый штемпель с волнами гашения** и контуром конверта | Живой курсив (`PT Serif Italic`, `14.6 CSS px`) + подпись отправителя справа внизу (`12.5 CSS px`) |
| **4. Странность** (`oddity`) | Приглушённая полоса с тёмно-зелёным корешком на полях и пунктирным контуром | Круглый **«зелёный глазок» лампового радиоприёмника (`6Е1П`)** и отметка `00:15 МГЦ` | Спокойный курсив с длинным тире (`PT Serif Italic`, `14.5 CSS px`) |
| **5. Ход лагеря** (`faction-move`) | Плотная карточка ведомственной сводки с широким красным корешком слева | **Пятиугольный щит-печать со звездой** (или один из 5 гербов лагерей из `faction-seals-*`) | Красная плашка лагеря (`11.5 CSS px`) + основной текст (`14.6 CSS px`) с зачином **«Без вашей визы…»** |

---

## 3. Таблица файлов, размеров и SHA-256

### 3.1. Шаблоны строк хроники (`viewBox 328×H` SVG / `656×2H` 2x WebP и JPEG) и контрольные экраны `360 px` (`1×`)

| ID | Тема | Рабочий WebP (`web/public/art/chronicle-1978/`) | Байты WebP | SHA-256 WebP | Вектор SVG (`web/public/art/chronicle-1978/`) | SHA-256 SVG | Архивный JPEG (`art-source/chronicle-1978/`) | SHA-256 JPEG |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| `row-anecdote-light` | `.paper` | `row-anecdote-light.webp` (`656×284`) | 22 068 | `302c3350a852dba4fcb53acf492e95856b3220ad687e369a3b4d3134d8b6e172` | `row-anecdote-light.svg` (`2 476` Б, `328×138`) | `b1e75921ad42a396fe718123f0627f15c7c1af8f07f43659a8e03aad47d13e7a` | `row-anecdote-light.jpg` (`46 355` Б) | `7327120f165ee9ca5c1f47a4ee40a8f61ba649d802c0cda92f3f0398119f1d3e` |
| `row-anecdote-dark` | `:root` | `row-anecdote-dark.webp` (`656×284`) | 21 552 | `43f84c5675a6b4f3a1b17f056c1718a105c386d9fa855e114fae3d41a9f87070` | `row-anecdote-dark.svg` (`2 476` Б, `328×138`) | `c681d8278f8423d9413ccae845170a7b4c29ab8bd9514c82e7aa22bc01b0fb16` | `row-anecdote-dark.jpg` (`45 296` Б) | `22390bbc849df7b2b19e09a6bdd5a5551680b24304c3e06ad0e79580d68ef3e8` |
| `row-prices-light` | `.paper` | `row-prices-light.webp` (`656×276`) | 23 002 | `61a51e581fafd00ddad04b03d475404a689ba95fa231f10e65eff91925fcb069` | `row-prices-light.svg` (`3 431` Б, `328×134`) | `38ce58315b65ea647fecb7f529f3f00fd854389ad1ff346869e9a4a4d49b9188` | `row-prices-light.jpg` (`54 049` Б) | `9b68f2ac9da1f8b799f69ad6ffc07533a145a360aad2e7db231b044770272d69` |
| `row-prices-dark` | `:root` | `row-prices-dark.webp` (`656×276`) | 23 146 | `43fb92b93ecfbec2e598ca4743a49e9e36918dbfd7fe2db23ce813ddf4da844c` | `row-prices-dark.svg` (`3 431` Б, `328×134`) | `c2b141fe13e22e12770d2eafebeb44b57e8499be23000ed10392aecac652abcf` | `row-prices-dark.jpg` (`53 853` Б) | `42a39a5c4fdb73153e992985fdc7ad3df2c248adb1d937bb8f215a75aaa63d16` |
| `row-letter-light` | `.paper` | `row-letter-light.webp` (`656×336`) | 35 376 | `ce32c27cc95adcd18d67efda658e7e352175999fc41abd264ca66cc55aa9e292` | `row-letter-light.svg` (`4 413` Б, `328×164`) | `b2d7e8b6601723d23f85f3cf8dcdd2ee8f2c17b6caf7bb6e93c0ae1c175cf45a` | `row-letter-light.jpg` (`71 303` Б) | `76b5ce59026873298f7c1e5a0fb1cdca035494ee45d7e4828b9522febae97f73` |
| `row-letter-dark` | `:root` | `row-letter-dark.webp` (`656×336`) | 34 752 | `e40658d453771a031c4b956fb4e6675e443ff98cb0603343928fb64da926c814` | `row-letter-dark.svg` (`4 423` Б, `328×164`) | `d2fc04894cfedbeec6793d6377bd41095edbaea5d02beef84269858c1d8edb14` | `row-letter-dark.jpg` (`68 913` Б) | `623091c21aca5a67611a6818c6eca1c15b8527beb5d885a3a474a617eb08cc4b` |
| `row-oddity-light` | `.paper` | `row-oddity-light.webp` (`656×296`) | 29 902 | `babf7b2a5899dcac8a5c27a18f5fbbf18e4b958f25653a285bdb3b363e54a481` | `row-oddity-light.svg` (`1 950` Б, `328×144`) | `5ede76edc2e5cd05eee25db29749c28626ea8618574d71e8cb6abd0b3d211f61` | `row-oddity-light.jpg` (`52 760` Б) | `598d10d9767031929bf16399491756937aaa579724746d0b319e6831d1d72762` |
| `row-oddity-dark` | `:root` | `row-oddity-dark.webp` (`656×296`) | 30 124 | `92172ac11a58dc20b95e51a1a9bd79f0667128c74ac661e566f267329fa8473c` | `row-oddity-dark.svg` (`1 950` Б, `328×144`) | `9ee6e6d8101f9ba07eaadeeca35c47cd7320d303c70c5b870ca906410f1e8660` | `row-oddity-dark.jpg` (`54 539` Б) | `46db96d898b12d61148b620faae94aa34d29c3453bb05f23093570e66c7cb612` |
| `row-faction-move-light` | `.paper` | `row-faction-move-light.webp` (`656×304`) | 23 724 | `11719d71568c158d827636020eb9cc86a2e13bfb9e3bbf27399f4cfc00b92377` | `row-faction-move-light.svg` (`2 010` Б, `328×148`) | `960faa7f3d7a76e2077e64aa3e70e3ed172b964b61cbb55f734580b91e62b147` | `row-faction-move-light.jpg` (`47 232` Б) | `f0aa2c6e06e46d67fc268e9b36adbcbf3d9a4bbc1e15d7fc415c0b5c462699ad` |
| `row-faction-move-dark` | `:root` | `row-faction-move-dark.webp` (`656×304`) | 24 180 | `80c16488da74399f76875d0dc1a38f4b3b73a7241112c203c6d8eca2e1df1ac4` | `row-faction-move-dark.svg` (`2 010` Б, `328×148`) | `57d90582b42e72eddf02eecd8f19b2ccd2af98743d3a4961e2abf54798494604` | `row-faction-move-dark.jpg` (`48 271` Б) | `515a951e314f7cc31c7922516a738364b35e10203b23045427721959f9b21504` |
| `faction-seals-light` | `.paper` | `faction-seals-light.webp` (`1280×208`) | 20 338 | `95e826c3b77a40ac0d539ed163da0527ff6566875d860ddf04bf881e7946cfa0` | `faction-seals-light.svg` (`4 856` Б, `640×100`) | `b7ddc7b13eb268819e2ed0ee9244d9b610188ef4f7a77c01a40d373478ffaefe` | `faction-seals-light.jpg` (`54 224` Б) | `1a0096cdcb879a1f6831b78e13c7f646a7b0371cae6ab95388c39dbb41e7d32e` |
| `faction-seals-dark` | `:root` | `faction-seals-dark.webp` (`1280×208`) | 20 684 | `aa360721da2d16163e55bda20bc1ffdb31a205e422f962a9278849b966d371af` | `faction-seals-dark.svg` (`4 856` Б, `640×100`) | `5ffd8aea932dd09f8f5840382efb3c82d2123a475cb3f920939932748cd67e2d` | `faction-seals-dark.jpg` (`55 177` Б) | `18f014006c7f95ccdb780b28c918f70cada5d85dd48ff54069120ecd4523b6dd` |
| `chronicle-feed-360px-light` | `.paper` | `chronicle-feed-360px-light.webp` (`360×1345`, `1×`) | 83 964 | `54161210bb562e2c1014f91d5931f6109ba59a5e3e43ece846c9f20b4e557315` | — | — | `chronicle-feed-360px-light.jpg` (`163 412` Б) | `de6705e78ad336f25ee10e5ac8650ec04b26e174e4219292eca743916cbd7b7b` |
| `chronicle-feed-360px-dark` | `:root` | `chronicle-feed-360px-dark.webp` (`360×1330`, `1×`) | 84 474 | `af5e7133e2b7a4503b11a2ba9dbdd65086f53cb540048ffecd402b781b4f2bec` | — | — | `chronicle-feed-360px-dark.jpg` (`160 019` Б) | `55e5dbff1da501262b06f9e21559ff1202d95caebf910785692592ddf404b75a` |

### 3.2. Векторные значки полей (`40×40` SVG для встраивания в CSS/JSX строк отдельно от HTML-текста)

| ID | Файл (`web/public/art/chronicle-1978/`) | Байты | SHA-256 |
| --- | --- | ---: | --- |
| `icon-anecdote` | `icon-anecdote.svg` | 610 | `0d4234073a9e2e6d0ec2e0c68cacd310185b4407642d911f6a4d02e650b3235b` |
| `icon-prices` | `icon-prices.svg` | 754 | `a70176f54c002efe76bb5541eda86a9374ce95ee4bd9f168413bf97051a1ae3f` |
| `icon-letter` | `icon-letter.svg` | 613 | `2bf0ac4cda8d4c84998b71a168ee922bdea89e7dc47688b1b5de00b64c91681e` |
| `icon-oddity` | `icon-oddity.svg` | 395 | `64bcdb0e7fcab4aa55f49319542c32c2c966d5bc254f55280173476adbcc9ff1` |
| `icon-faction` | `icon-faction.svg` | 454 | `63a86e9b38273958f66c7a2b907707900e1c6c345ac54bfeabfb2e026997f3c6` |

---

## 4. Правила интеграции в `web/app/chronicle/` (для GPT, класс B — HTML-текст отдельно от SVG-декора)

1. **HTML-текст (`14.5–15.5 CSS px`) отдельно от SVG-декора (`icon-*.svg`):**
   - При интеграции в React/Next.js текст строк рендерится обычным HTML/DOM (а не запечённой картинкой), чтобы на любом мобильном экране `360 px` кегль оставался `14.5–15.5 CSS px` с естественным переносом и естественной высотой карточки.
   - Каждая строка использует двухколоночную сетку `display: grid; grid-template-columns: 48px 1fr; gap: 9px; padding: 9px 10px;` с левым SVG-значком (`36×36 px` из `icon-*.svg`) и правой HTML-колонкой:
     - `.anecdote`: фон `#ebe7dc` (в тёмной `#262328`), пунктирный правый бордер левой колонки `1px dashed #7a6e7d`, шрифт `'Courier New', monospace`, `font-size: 14px; line-height: 1.36`, цвет `#352947` / `#d8caee`;
     - `.prices`: фон ярлыка `#d4c39b` (`#2c261c`), значок `icon-prices.svg` слева и `display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px` для трёх ячеек цен (`font-size: 14.5px` для цены, `11px` для товара и сдвига);
     - `.letter`: фон `#eee6cf` (`#27221c`) с верхней почтовой полосой `border-top: 4px solid #8f2c20`, вертикальной красной чертой полей `border-right: 1.5px solid #b84b3a`, тетрадной линейкой `repeating-linear-gradient(to bottom, transparent 0 21px, rgba(56,98,150,.2) 21px 22px)`, курсивным текстом `14.6px` и подписью `12.5px`;
     - `.oddity`: фон `#d4d0be` (`#18201d`), левый корешок `5px solid #2a5c47`, пунктирный контур, значок `icon-oddity.svg` и курсивный текст `14.5px`;
     - `.factionMove`: фон `#e5dac0` (`#28201d`), левый корешок `6px solid #8c2b20`, плашка имени лагеря (`11.5px`) сверху, текст `14.6px` и печать из `icon-faction.svg` / `faction-seals-*.svg`.

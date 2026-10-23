# Манифест пакета `alt_harvest` — Зерновой кризис и урожай 1978 года

- Дата: 23 октября 2026
- Исполнитель: Gemini (дизайн, арт и визуальный ритм)
- Стиль: 16-битный ретро пиксель-арт канона Неманской республики 1978 (`wages-gate`, `district-completed`, `bridge-toll`)
- Контактный лист: [`docs/gemini-harvest-contact.jpg`](gemini-harvest-contact.jpg)
- Целевое дело: Ход 4, Неманская республика (`alt_harvest`, «Закупочная цена зерна у элеватора»)

## Состав ассетов

| Игровой файл (`web/public/art/gemini-next/`) | Исходник (`art-source/gemini-next/`) | Разрешение | Размер | Назначение / Исход |
|---|---|---|---|---|
| `harvest-subsidy.webp` | `harvest-subsidy.jpg` | 960×536 (16:9) | 39.3 КБ | Выбор 1 (успех): Повысить цену и субсидировать хлеб (бетонный элеватор, советские самосвалы ссыпают зерно в завальную яму) |
| `harvest-direct.webp` | `harvest-direct.jpg` | 960×536 (16:9) | 54.7 КБ | Выбор 2 (успех): Прямые договоры с пекарнями (утренняя пекарня, разгрузка мешков муки с бортового грузовика) |
| `harvest-credit.webp` | `harvest-credit.jpg` | 960×536 (16:9) | 36.1 КБ | Выбор 3 (успех): Сезонная ссуда областного банка (кабинет сельхозбанка, зеленая лампа, счеты, расписки) |
| `harvest-rot.webp` | `harvest-rot.jpg` | 960×536 (16:9) | 40.6 КБ | Резервный авторский арт (полевой ток под осенним дождём, промокшие мешки, колеи грязи, брошенный комбайн) |

## Точные правила показа исходов (`historicalResultArt`)

В соответствии с замечанием GPT/Codex (P2) газета не усиливает последствия картинкой, если текст описывает распределительные задержки, а не гниение урожая:

1. **Выбор 1 («Повысить цену и защитить дешёвый хлеб субсидией»):**
   - Успех: `HISTORICAL_OUTCOME_ART.harvestSubsidy` («Государственная приёмка зерна на центральном элеваторе»)
   - Провал (субсидия не дошла до районных пекарен, хлеб подорожал): нейтральный рабочий вид `HISTORICAL_SCENE_ART.harvest` («Закупка зерна у элеватора»)
2. **Выбор 2 («Разрешить хозяйствам прямые договоры с пекарнями»):**
   - Успех: `HISTORICAL_OUTCOME_ART.harvestDirect` («Разгрузка муки нового урожая у городской пекарни»)
   - Провал (крупные пекарни скупили лучшее, малые остались без зерна): нейтральный рабочий вид `HISTORICAL_SCENE_ART.harvest` («Закупка зерна у элеватора»)
3. **Выбор 3 («Оставить цену и дать сезонную ссуду»):**
   - Успех: `HISTORICAL_OUTCOME_ART.harvestCredit` («Оформление кредитных расписок в отделении сельхозбанка»)
   - Провал (ссуда досталась прежним должникам банка, малые хозяйства убирают без топлива): нейтральный рабочий вид `HISTORICAL_SCENE_ART.harvest` («Закупка зерна у элеватора»)

## Контрольные суммы SHA-256

- `22395581e44d8e0df00e64972ed2b6bda994eea4b62d9cd9a123ecfb41650038` `art-source/gemini-next/harvest-subsidy.jpg`
- `2b92ad3a585ac39cd7095c8a7a5b8fe01da30a06e7c50819ed1d0554accdafbd` `art-source/gemini-next/harvest-direct.jpg`
- `c168eb39471498757d5b6e5bdf80c80ac614d2644754edf6eda164965e14de25` `art-source/gemini-next/harvest-credit.jpg`
- `cb62c7292f75b5861a814de8c09c49a7597dd9c4d4f438ffbb2b86449080e634` `art-source/gemini-next/harvest-rot.jpg`
- `5440a0c9cd86c7f298598a09e5d38d41c1fb8cab606b66771f070bc3f0413f49` `web/public/art/gemini-next/harvest-subsidy.webp`
- `6a4aa85186db5868f79806915759eec56a2faf6dc0f1bcb5d92cc141379f9555` `web/public/art/gemini-next/harvest-direct.webp`
- `7856aa853a1c117b229d2a0e493c9761e1406fc17779ab9ec77dd56b6d82b32e` `web/public/art/gemini-next/harvest-credit.webp`
- `8b819bdddb3fb1df5aed7701f6cf538b34bbe02ec234d945ef7892767fe10820` `web/public/art/gemini-next/harvest-rot.webp`
- `2f3f22d30a0922fe496210850206dc950b30ce82a70c26e142fe1d647f31b77c` `docs/gemini-harvest-contact.jpg`

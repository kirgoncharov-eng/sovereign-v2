# Манифест пакета `alt_standards` — Промышленные стандарты и насосы 1978 года

- Дата: 24 октября 2026
- Исполнитель: Gemini (дизайн, арт и визуальный ритм)
- Стиль: 16-битный ретро пиксель-арт канона Неманской республики 1978 (`wages-gate`, `district-completed`, `harvest-subsidy`)
- Контактный лист: [`docs/gemini-standards-contact.jpg`](gemini-standards-contact.jpg)
- Целевое дело: Ход 3, Неманская республика (`alt_standards`, «Чужой рынок, другие станки», а также его продолжения `alt_standards_chamber` и `alt_standards_patriots`)

## Состав ассетов

| Игровой файл (`web/public/art/gemini-next/`) | Исходник (`art-source/gemini-next/`) | Разрешение | Размер | Назначение / Исход |
|---|---|---|---|---|
| `standards-testing.webp` | `standards-testing.jpg` | 960×536 (16:9) | 57.8 КБ | Выбор 1 (успех): Оплатить испытательную линию (опытный стенд, чугунный насос, манометры, проверка допусков по регламенту Торгового союза) |
| `standards-eastern.webp` | `standards-eastern.jpg` | 960×536 (16:9) | 84.3 КБ | Выбор 2 (успех): Сохранить старую линию и российские заказы (тяжёлый советский механосборочный цех, мостовой кран, конвейер насосов) |
| `standards-contest.webp` | `standards-contest.jpg` | 960×536 (16:9) | 50.0 КБ | Выбор 3 (успех): Позволить двум заводам конкурировать (светлый цех малого приборостроительного завода, компактный насос на верстаке) |
| `standards-defect.webp` | `standards-defect.jpg` | 960×536 (16:9) | 27.4 КБ | Неуспех испытаний (забракованная комиссией Торгового союза партия, меловые кресты ОТК, расстроенный инженер под конусом лампы) |

## Точные правила показа исходов (`historicalResultArt`)

В соответствии с каноном газеты и драматургией текста последствия строго согласованы с исходом:

1. **Выбор 1 («Оплатить испытательную линию»):**
   - Успех (образцы прошли испытания): `HISTORICAL_OUTCOME_ART.standardsTesting` («Испытательная линия промышленных насосов получила первый заказ»)
   - Провал (образцы не прошли испытания, забракованы комиссией): `HISTORICAL_OUTCOME_ART.standardsDefect` («Партия насосов забракована комиссией Торгового союза»)
2. **Выбор 2 («Сохранить старую линию и российские заказы»):**
   - Успех (завод сохранил выпуск, покупатель поднял заказ): `HISTORICAL_OUTCOME_ART.standardsEastern` («Конвейер сохранён: отгрузка насосов по прежним стандартам»)
   - Провал (покупатель сократил заказ, станки работают на склад): нейтральный рабочий вид `HISTORICAL_SCENE_ART.standards` («Насос и чертежи в опытном цехе») — без ложной катастрофы
3. **Выбор 3 («Позволить двум заводам конкурировать за контракт»):**
   - Успех (контракт выиграл небольшой завод): `HISTORICAL_OUTCOME_ART.standardsContest` («Небольшой завод выиграл контракт на поставку насосов»)
   - Провал (конкурс остановился без гарантий): нейтральный рабочий вид `HISTORICAL_SCENE_ART.standards` («Насос и чертежи в опытном цехе»)
4. **Сюжетные продолжения (`alt_standards_chamber`, `alt_standards_patriots`):**
   - Решения о продаже Торговому союзу / отправке образцов: `standardsTesting` (успех) или `standardsDefect` (провал).
   - Решение об отдаче линии палате под мелиорацию: `standardsEastern`.
   - Решение о разделении линии: `standardsContest`.

## Контрольные суммы SHA-256

- `76c67cb727e6a9f6d7ac91809f5dfb620ed704e9cea6b56d9bf74460537327e1` `art-source/gemini-next/standards-testing.jpg`
- `314ec3aacd74fd0ec2fd135fa7fafe01989706bd7cf6ede3a801328c7d19d2dc` `art-source/gemini-next/standards-eastern.jpg`
- `a34a3254cbda48d2892618183b777f9f0c8dfa3db91a641d8c2c8e4e2dead1c0` `art-source/gemini-next/standards-contest.jpg`
- `5a98173db2826a8d014a35ff2a0938d19e352957f5e8e1ea9d02c9e83877702f` `art-source/gemini-next/standards-defect.jpg`
- `56f0c31065e50ec46efad8e9cd56eefbdfab39b5a7652d518d667487c7371314` `web/public/art/gemini-next/standards-testing.webp`
- `671313c62db7d73f5b2062e550ac8953b139605fd4afe179348e51a7100c5dce` `web/public/art/gemini-next/standards-eastern.webp`
- `7e5f42bc9fbc0eed17b2144b60bf46c891d03986bb9027a51c32f3f45a52483c` `web/public/art/gemini-next/standards-contest.webp`
- `9fa5a63e6e70bdd1795a0dadd698c98af87cc790c5f6e903c00bb8ffd768c981` `web/public/art/gemini-next/standards-defect.webp`
- `65c28d198a4951d26a8d0dec3cbe471e2869e4e541ba806e6aa19543e535e0dc` `docs/gemini-standards-contact.jpg`

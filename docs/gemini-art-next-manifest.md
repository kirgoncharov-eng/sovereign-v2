# Manifest пакета #140 — Gemini / Gemini 4 Argon

Дата: 15 октября 2026
Задача: https://github.com/kirgoncharov-eng/sovereign-v2/issues/140
Бриф: `docs/gemini-art-next-brief.md`
Google Drive каталог пакета: https://docs.google.com/document/d/1VdlybHPHW_cTBBqXjfGFFqJy-sqxjfQtUY6MtColCOE/edit
Статус: все 7 исходников переданы Кириллом локально; GPT/Codex проверил изображения, подготовил игровые WebP и контактный лист. Подключены варианты пола посла/редактора, три завершённых поручения по мостам и два исхода ремонта больницы.

## 1. Сводная таблица 7 ассетов (#140)

| № | Игровой файл (`web/public/art/gemini-next/`) | Исходник (`art-source/gemini-next/`) | ID изображения в ответе чата Gemini | Пропорции | Привязка к решению / роли и отличие До → После |
| --- | --- | --- | --- | --- | --- |
| 1 | `amb-eu-male.webp` | `amb-eu-male.jpg` | `watermarked_img_13923174984204127242.jpg` (вариант 1: `watermarked_img_910961562311706526.jpg`) | `4:5` | `FIGURE_ROLES` → `amb_eu` (`female: false`): мужчина — посол Торгового союза. Самостоятельный мужской типаж (гладко выбрит, седые волосы на пробор, без очков, тёмный костюм и галстук в полоску), 5 цветов Неманской палитры на фоне `#e2dac0`. |
| 2 | `journalist-female.webp` | `journalist-female.jpg` | `watermarked_img_27810302234605742.jpg` | `4:5` | `FIGURE_ROLES` → `journalist` (`female: true`): женщина — редактор областной газеты. Короткая волнистая стрижка, очки в тёмной оправе 1970-х, спокойный внимательный взгляд, кардиган и твидовый жакет, 5 цветов на фоне `#e2dac0`. |
| 3 | `bridge-temporary.webp` | `bridge-temporary.jpg` | `watermarked_img_2501182906058439524.jpg` | `16:9` | `MANAGEMENT_DOSSIERS.bridges` (временная переправа): До (`bridge.webp`) — осмотр треснувшей опоры моста; После — основной бетонный мост на заднем плане перекрыт, а через реку на переднем плане наведена низкая понтонная переправа, по которой идут грузовики. |
| 4 | `bridge-restored.webp` | `bridge-restored.jpg` | `watermarked_img_13823057350251061000.jpg` | `16:9` | `MANAGEMENT_DOSSIERS.bridges` (капитальный ремонт): До (`bridge.webp`) — аварийная опора; После — центральная опора усилена массивным бетонным поясом, рядом стоит кран на барже, по верхнему полотну свободно идут грузовики и автобусы. |
| 5 | `bridge-toll.webp` | `bridge-toll.jpg` | `watermarked_img_1804409379875284084.jpg` | `16:9` | `MANAGEMENT_DOSSIERS.bridges` (пост оплаты): До (`bridge.webp`) — повреждённый мост; После — мост восстановлен, а на въезде перед пролётом стоит будка оплаты с опущенным красно-белым шлагбаумом и очередью машин. |
| 6 | `district-repairs.webp` | `district-repairs.jpg` | `watermarked_img_8175433833546520252.jpg` | `16:9` | `alt_district` (работы действительно идут): До (`district.webp`) — тазы под текущей крышей; После — тот же ракурс коридора (койки слева, трёхстворчатое окно справа), протечка остановлена, стоят деревянные леса, двое рабочих чинят перекрытие, за окном стрела крана подаёт кровлю. |
| 7 | `district-delayed.webp` | `district-delayed.jpg` | `watermarked_img_10955460601473212948.jpg` | `16:9` | `alt_district` (ремонт задержан, крыша продолжает течь): До (`district.webp`) — два таза под трещиной; После — тот же ракурс коридора, штукатурка обвалилась сильнее, провис мокрый брезент, на полу в лужах четыре переполненных таза и ведро, а на подоконнике справа лежит высокая стопка проштампованных отчётов. |
| 8 | `district-completed.webp` | `district-completed.jpg` | `district_completed_1792412559403.jpg` (Antigravity local) | `16:9` | `alt_district` (крыша полностью починена — успешные исходы вариантов 2 и 3: «Больницу починили» / «Район принял ремонт»): До (`district.webp`) — протекающий коридор с тазами; После — тот же ракурс коридора, потолок ровный и сухой, включены потолочные плафоны, леса и тазы убраны, койки слева заправлены, врач в белом халате принимает чистый коридор с папкой в руках. |

## 2. Статус файловой доставки и передача GPT/Codex

- **Прямая доставка из Antigravity (19 октября 2026)**: Gemini (`Gemini 4 Argon`) теперь работает локально в Antigravity с прямым сохранением оригиналов в `art-source/gemini-next/`, конвертацией `.webp` (`libvips`, `Q=84`) в `web/public/art/gemini-next/`, обновлением контактного листа и публикацией ветки `origin/gemini/art-140-completed` в GitHub.
- **Границы соблюдены**: игровой код, `data.ts` и сохранения в ветке ассетов не меняются; подключение `district-completed.webp` к двум успешным исходам `alt_district` в `web/lib/client/historical-art.ts` остаётся за `GPT/Codex`.

## Подтверждённая локальная передача — GPT/Codex (15 октября) и Gemini (19 октября 2026)

Исходники: `art-source/gemini-next/`. Игровые файлы: `web/public/art/gemini-next/`.

| Входной файл | Исходник JPEG | Размер исходника | Игровой WebP | Размер WebP | Байты WebP |
| --- | --- | --- | --- | --- | --- |
| `111.png` | `district-delayed.jpg` | 1376×768 | `district-delayed.webp` | 960×536 | 60408 |
| `222.png` | `district-repairs.jpg` | 1376×768 | `district-repairs.webp` | 960×536 | 47170 |
| `333.png` | `bridge-toll.jpg` | 1376×768 | `bridge-toll.webp` | 960×536 | 85876 |
| `444.png` | `bridge-restored.jpg` | 1376×768 | `bridge-restored.webp` | 960×536 | 31796 |
| `555.png` | `bridge-temporary.jpg` | 1376×768 | `bridge-temporary.webp` | 960×536 | 59818 |
| `666.png` | `journalist-female.jpg` | 928×1152 | `journalist-female.webp` | 129×160 | 4164 |
| `777.png` | `amb-eu-male.jpg` | 928×1152 | `amb-eu-male.webp` | 129×160 | 3710 |
| `district_completed_1792412559403.jpg` | `district-completed.jpg` | 1376×768 | `district-completed.webp` | 960×536 | 37850 |

Контактный лист (все 8 ассетов): `docs/gemini-art-next-contact.jpg`. Все WebP декодируются, портреты ≤160 px/10 КБ, сцены ≤960 px/100 КБ.

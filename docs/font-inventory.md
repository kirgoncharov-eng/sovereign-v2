# Поставляемые шрифты — #113

Проверено GPT/Codex 16 октября 2026 на базе `12d0c91`.
Это реестр конкретных шрифтов, а не заключение о юридической готовности всей игры.

## Локальные файлы

| Файлы относительно `web` | Версия | Происхождение и изменение |
| --- | --- | --- |
| `assets/fonts/handjet-{regular,bold}.ttf` | 2.003 | Handjet; объединённые латиница и кириллица; добавлен полный notice |
| `assets/fonts/SovereignSerif-{Regular,Bold,Italic}.ttf` | 2.1.5; Sovereign subset 1 | Subset Liberation Serif; переименован, добавлен notice |
| `public/fonts/handjet-{regular,bold}-{latin,cyrillic}.woff2` | 2.003 | Handjet; добавлен полный notice |
| `public/fonts/tiny5-{latin,cyrillic}.woff2` | 1.002 | Tiny5; добавлен полный notice |

11 файлов. Точные версии из таблицы `name`, количество символов/глифов, исходные и новые
SHA-256, отпечатки таблиц отрисовки находятся в `web/assets/fonts/inventory.json`.
TTF появились в репозитории в `423076dc1e4e1479657d8b77b0dbe7ca97fbfae4`,
WOFF2 — в `53c93045a92695c50202cbf307ffc69c4630896c`.
Точный upstream-коммит первоначальной загрузки бинарников не установлен; версия из метаданных
не выдаётся за доказательство такого коммита.

Sovereign Serif — собственное имя производной гарнитуры, а не новая авторская гарнитура.
У исходного Liberation зарезервированы Liberation, Arimo, Tinos, Cousine. Эти имена удалены
из первичных имён производной, но сохранены в оригинальном copyright/тексте лицензии.
Handjet и Tiny5 не объявляют Reserved Font Names в полученных notices.
Контуры, кернинг, cmap и метрики всех 11 файлов побайтно неизменны после декодирования:
`scripts/font-notices.py` проверяет все таблицы, кроме `name`, подписи DSIG и служебных
checksum/timestamp полей `head`. Повторный запуск не меняет файлы.

## Next/font: тоже часть поставки

`web/app/layout.tsx` загружает и самостоятельно раздаёт через Next/font:

| Семейство | Наблюдаемая версия в WOFF2 сборки | Начертания | Reserved Font Names |
| --- | --- | --- | --- |
| PT Serif | 1.000W OFL | 400/700, normal/italic | PT Sans, PT Serif, ParaType |
| PT Mono | 1.001W OFL | 400 normal | PT Sans, PT Serif, PT Mono, ParaType |
| Marck Script | 1.002 | 400 normal | Marck Script |

Эти полученные от Google Fonts файлы мы не редактируем и не переименовываем.
Next/font не закрепляет upstream-версию в `layout.tsx`: при обновлении поставки нужно снова
сверить метаданные и notices. PT Mono в бинарном copyright указывает 2010, а текущий
upstream OFL — 2011; исходные данные не переписываются и оба указания учтены.

В trace серверной карточки также входит неизменённый
`node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf` из Next.js 16.2.6:
Geist, версия 1.800 (ttfautohint v1.8.4.16-eb64), copyright 2024 Geist Project Authors.
В первичном notice Geist Reserved Font Names не объявлены. Полный OFL включён в поставку,
даже несмотря на то, что наша карточка передаёт собственные пять начертаний.

## Полные notices и источники

Полные неизменённые copyright + OFL 1.1 лежат в `web/public/fonts/licenses/`.
Для всех локальных TTF/WOFF2 полный notice дополнительно встроен в `name` ID 13;
поэтому standalone-демо сохраняет его внутри встроенных WOFF2 без изменения сборщика.
`next.config.ts` явно включает notices и TTF в серверный trace `/api/card`.
Публичные URL `/fonts/licenses/<семейство>.txt` доступны вместе с клиентскими файлами.

| Notice | Первичный источник |
| --- | --- |
| Geist | https://github.com/google/fonts/blob/main/ofl/geist/OFL.txt |
| Handjet | https://github.com/google/fonts/blob/main/ofl/handjet/OFL.txt |
| Tiny5 | https://github.com/google/fonts/blob/main/ofl/tiny5/OFL.txt |
| Liberation | https://github.com/liberationfonts/liberation-fonts/blob/main/LICENSE |
| PT Serif | https://github.com/google/fonts/blob/main/ofl/ptserif/OFL.txt |
| PT Mono | https://github.com/google/fonts/blob/main/ofl/ptmono/OFL.txt |
| Marck Script | https://github.com/google/fonts/blob/main/ofl/marckscript/OFL.txt |

Неизменяемые Git **blob** SHA текстов закреплены в `web/assets/fonts/license-sources.json`;
это не SHA коммитов. Тест сверяет Git-хеш каждого полного текста, не только заголовок.
Официальные условия: https://openfontlicense.org/open-font-license-official-text/.
OFL распространяется на ПО шрифтов и производные от него; не перелицензирует код игры,
авторскую прозу или изображения результата с отрисованным текстом.

## Проверка при изменении

1. Сверить метаданные и copyright/RFN с первичными источниками.
2. Для локальных файлов запустить описанный в `web/assets/fonts/README.md` скрипт.
3. `cd web && npm run check && npm run build`.
4. Проверить notices в `/fonts/licenses/` и trace `/api/card`.
5. Открыть `/api/card` в обычном и `f=story` форматах; проверить кириллицу и мобильную игру.

Графика букв и игровые правила не меняются, APP_VERSION не повышается.

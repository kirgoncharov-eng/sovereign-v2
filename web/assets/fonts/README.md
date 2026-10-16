Шрифты серверной карточки (`app/api/card`): Satori читает TTF, OTF и WOFF, но не WOFF2.

- `handjet-*.ttf` — Handjet 2.003: латиница и кириллица объединены из WOFF2 в `public/fonts`.
- `SovereignSerif-*.ttf` — Sovereign Serif: прежний subset Liberation Serif 2.1.5,
  переименованный из-за Reserved Font Name. Контуры, кернинг и метрики не менялись.

Каждый файл содержит полный copyright/OFL в таблице `name`, ID 13.
Оригинальные notices всех семи поставляемых семейств: `../../public/fonts/licenses/`.
Их точные источники и Git blob SHA — `license-sources.json`; версии, SHA-256 и отпечатки
таблиц отрисовки локальных файлов — `inventory.json`. Полный реестр: `../../../docs/font-inventory.md`.

Обновление метаданных воспроизводится из `web`:

```sh
python -m pip install fonttools==4.61.1 brotli==1.2.0
python scripts/font-notices.py
node --test lib/server/card-fonts.test.ts
```

Скрипт не скачивает шрифты и проверяет неизменность таблиц отрисовки.
OFL относится к шрифтам, а не к коду, авторскому тексту или карточкам результата игры.

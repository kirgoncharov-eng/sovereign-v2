# «Суверен»: первая сцена с рисованными советниками

11 октября 2026, GPT/Codex. Задача #95, первый вариант для сравнения.
Кирилл согласовал направление после просмотра интерфейса: заметные люди,
читаемый служебный текст, подробности по раскрытию. Это гипотеза опыта игрока;
рост завершения партий и возврата пока не измерен.

## Что можно посмотреть

`/art-review` — отдельный экран настоящего дела с двумя советниками.
Кнопка сравнения переключает крупные рисунки и маленькие процедурные лица.
Оба варианта используют одинаковые реплики и варианты из движка.
Выбор раскрывает объяснение цены; подпись показывает настоящий расчёт и газету.
Данные остаются в памяти экрана: сохранение и аналитика игры не затрагиваются.

В основной игровой поток этот экран ещё не встроен. PR #102 меняет главный
экран и остаётся открытым; его файлы не пересекаются с этой частью #95.
Следующий этап #95 — интеграция выбранного оформления после завершения #102.
Задачу #95 эта часть не закрывает.

## Арт-направление

- Портреты: графит и тушь на бумаге, угольные и охристые тона. Различимые
  силуэты, лицо и характер важнее микродеталей. Без сходства с реальными политиками.
- В деле лицо занимает 68×85 px (60×75 на узком телефоне); исходник WebP
  шириной 448 px пригоден и для крупной карточки человека.
- Рисунок закреплён за конкретным именем фиксированной сцены, а не за ролью.
  Случайные люди и остальные страны сохраняют процедурные портреты.
- Эмоция не выдаёт скрытую лояльность и не обозначает правильный вариант.
- История и реплики: существующий литературный шрифт. Цена, роль, статус,
  срок и действия: читаемый обычный шрифт. Пиксельный — для печатей и акцентов.
- Раскрываются полное дело и биография. Суть ситуации, реплики, варианты,
  предупреждения о кризисе и действие всегда доступны.
- Точные скрытые эффекты появляются после подписи; объяснение затрат — до неё.
- Анимация в этой части: короткая печать после решения. При reduced motion
  движение отключено. Полную анимацию лиц пока не вводим.

## Первая партия изображений

| Человек в сцене | Материал | Вес |
| --- | --- | --- |
| Оксана Гончар, экономический советник | `web/public/art/advisors/economist-v1.webp` | 44 258 байт |
| Юрий Бондаренко, советник по безопасности | `web/public/art/advisors/security-v1.webp` | 53 666 байт |

Всего 97 924 байта. Сборка основного одностраничного демо рисунки пока не
загружает; увеличение относится к отдельному экрану. При интеграции повторно
проверить бюджет демо около 1 МБ, постоянную идентичность лиц и первую сессию.

Рисунки созданы встроенным image_gen. После отбора выполнены только уменьшение
и кодирование WebP. Исходники сохранены в стандартной папке generated_images
этого чата; материалы проекта находятся по путям выше.

## Промпты генерации

### Оксана Гончар

Use case: stylized-concept. Asset type: individual illustrated character portrait for the mobile political game Sovereign.
One wholly fictional female economic adviser, age about 47, short dark bob haircut with a distinctive silver streak at one temple,
narrow rectangular spectacles, strong thoughtful face and slightly tired eyes, plain charcoal jacket and oatmeal blouse.
No resemblance to any real politician or celebrity. Her expression is attentive and quietly skeptical, not friendly caricature and not villainous.
Style: hand-drawn ink and graphite engraving, bold clear shapes, limited four-tone warm charcoal/ochre/parchment palette,
rough printed-document grain. Readable at 64px wide: strong silhouette, large facial features, minimal micro-detail.
Compose a SINGLE centered bust portrait, full head and shoulders completely within frame, upright 4:5 portrait composition,
warm pale parchment flat background to the edges. Side lighting, dry serious wit, grounded human character.
No writing, symbols, flags, insignia, borders, badges, weapons, extra people, collage, photorealism, anime or glossy 3D.
Keep ample narrow margins around hair and shoulders. Output one image.

### Юрий Бондаренко

Use case: stylized-concept. Asset type: individual character portrait for mobile political game Sovereign.
A SINGLE wholly fictional male security adviser, age about 56, broad square face, receding cropped hair with grey temples,
prominent heavy brows and a slightly crooked nose, clean shaven, plain dark civilian jacket with a light shirt, no tie.
No resemblance to real politicians or celebrities. Composed, vigilant, understated expression; not villainous, angry or militaristic.
Style: handcrafted ink and graphite engraving on parchment, large bold readable forms,
limited four-tone warm charcoal/ochre/parchment palette with rough printed-document grain.
Match a serious illustrated-document aesthetic; not glossy realistic photography.
Centered upright single head-and-shoulders portrait in a 4:5 frame, full head visible,
some breathing room around hair, shoulders in frame. Flat pale warm parchment background extends to all edges.
Side lighting. Readable at 64px wide, distinctive silhouette, minimal microscopic detail.
No text, badges, logos, flags, uniforms, medals, weapons, border, extra people, collage, anime or 3D. Output one image.

## Проверка

Сцена проходит во всех шести странах, страницы 320/390/760 без горизонтального
переполнения. Проверены сравнение, выбор, подпись, повтор, неизменность localStorage.
Ошибок браузера нет. check 270/270, production build. Обычная партия дошла до
финала на 20-м ходу: problems=[], первое решение 4623 мс, стол на первом ходу
скрыт. Скриншоты ходов 1–3 просмотрены. Понятность и интерес
нужно подтвердить партией Кирилла, автоматический прогон этого не доказывает.
